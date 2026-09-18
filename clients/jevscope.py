"""
JevScope client for Python agents.

One file, standard library only, Python 3.9+. Copy it into your project.

    from jevscope import JevScope

    scope = JevScope("http://localhost:3000")
    run = scope.start_run(name="My agent", task="Fix the failing build")

    # wrap a tool: it runs, then the call and its result are reported
    out = run.tool("shell", {"command": "npm test"}, lambda: subprocess.run(...).stdout)

    # or report any event yourself
    run.report(event_type="message", content="Tests pass. Opening a PR.")

    run.finish()

`report` and `tool` never block your agent on the evaluator: a single
background thread sends events strictly in order (JevScope numbers steps by
arrival, and each judgment looks at the steps before it). Reporting failures
go to `on_error` and never raise into the agent. Use `step` when you want to
wait for the judgment, for example to stop a run that is going in circles.
"""

from __future__ import annotations

import json
import queue
import threading
import urllib.error
import urllib.request
from concurrent.futures import Future
from typing import Any, Callable, Optional, TypeVar

T = TypeVar("T")

EVENT_TYPES = (
    "message",
    "tool_call",
    "tool_result",
    "file_read",
    "file_write",
    "shell",
    "test",
    "completion",
)


#: Stays under the server's 20,000-character limits, which reject rather than truncate.
MAX_CHARS = 19_000


def _warn(error: Exception) -> None:
    print(f"[jevscope] {error}")


def _clamp_text(value: str) -> str:
    """Keeps the head and the tail: the end of a log usually carries the outcome."""
    if len(value) <= MAX_CHARS:
        return value
    head = -(-MAX_CHARS * 6 // 10)
    tail = MAX_CHARS - head
    omitted = len(value) - MAX_CHARS
    return f"{value[:head]}\n…[{omitted} characters omitted]…\n{value[-tail:]}"


def _clamp_payload(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        return _clamp_text(value)
    serialized = json.dumps(value, default=str)
    return json.loads(serialized) if len(serialized) <= MAX_CHARS else _clamp_text(serialized)


class JevScope:
    def __init__(
        self,
        base_url: str = "http://localhost:3000",
        on_error: Callable[[Exception], None] = _warn,
        timeout: float = 60.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.on_error = on_error
        self.timeout = timeout

    def start_run(self, name: str, task: str, system_context: Optional[str] = None) -> "Run":
        body: dict[str, Any] = {"name": name, "task": task}
        if system_context:
            body["systemContext"] = system_context
        created = self._request("POST", "/api/runs", body)
        return Run(self, created["run"]["id"])

    def _request(self, method: str, path: str, body: Any = None) -> Any:
        data = None if body is None else json.dumps(body, default=str).encode()
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=data,
            method=method,
            headers={"content-type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                text = response.read().decode()
        except urllib.error.HTTPError as error:
            detail = error.read().decode()[:300]
            raise RuntimeError(f"{method} {path} failed with HTTP {error.code}: {detail}") from None
        return json.loads(text) if text else None


class Run:
    def __init__(self, scope: JevScope, run_id: str) -> None:
        self.scope = scope
        self.id = run_id
        #: Open this in a browser to watch the run live.
        self.url = f"{scope.base_url}/runs/{run_id}"
        self._queue: "queue.Queue[tuple[dict[str, Any], Future]]" = queue.Queue()
        threading.Thread(target=self._send_loop, daemon=True).start()

    def _send_loop(self) -> None:
        while True:
            event, future = self._queue.get()
            try:
                future.set_result(self.scope._request("POST", f"/api/runs/{self.id}/steps", event))
            except Exception as error:  # noqa: BLE001 - reported, never raised into the agent
                future.set_exception(error)
            finally:
                self._queue.task_done()

    def _enqueue(self, event_type: str, content: str, **fields: Any) -> Future:
        if event_type not in EVENT_TYPES:
            raise ValueError(f"event_type must be one of {EVENT_TYPES}")
        event: dict[str, Any] = {
            "eventType": event_type,
            "content": _clamp_text(content.strip() or f"{event_type} event"),
        }
        names = {"tool_name": "toolName", "tool_arguments": "toolArguments", "tool_result": "toolResult"}
        for key, value in fields.items():
            if value is None:
                continue
            if key in ("tool_arguments", "tool_result"):
                value = _clamp_payload(value)
            event[names.get(key, key)] = value
        future: Future = Future()
        self._queue.put((event, future))
        return future

    def step(self, event_type: str, content: str, **fields: Any) -> dict[str, Any]:
        """Sends one event and waits for its judgment."""
        return self._enqueue(event_type, content, **fields).result()

    def report(self, event_type: str, content: str, **fields: Any) -> None:
        """Sends one event in the background. Never raises, never blocks."""
        future = self._enqueue(event_type, content, **fields)
        future.add_done_callback(
            lambda f: self.scope.on_error(f.exception()) if f.exception() else None
        )

    def tool(
        self,
        tool_name: str,
        tool_arguments: Any,
        execute: Callable[[], T],
        content: Optional[str] = None,
    ) -> T:
        """Runs a tool and reports it. Returns or re-raises exactly what the tool did."""
        content = content or f"Calling {tool_name}."
        try:
            result = execute()
        except Exception as error:
            self.report("tool_call", content, tool_name=tool_name,
                        tool_arguments=tool_arguments, tool_result={"error": str(error)})
            raise
        self.report("tool_call", content, tool_name=tool_name,
                    tool_arguments=tool_arguments, tool_result=result)
        return result

    def flush(self) -> None:
        """Waits until every reported event has been sent."""
        self._queue.join()

    def finish(self, status: str = "completed") -> None:
        """Flushes, then marks the run finished."""
        self.flush()
        try:
            self.scope._request("PATCH", f"/api/runs/{self.id}", {"status": status})
        except Exception as error:  # noqa: BLE001
            self.scope.on_error(error)
