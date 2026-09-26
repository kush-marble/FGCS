import time
from typing import Any, List

from app.drone import WILDCARD_MESSAGE_LISTENER
from app.utils import sendMessage
from flask_socketio import SocketIOTestClient

# Messages the dashboard used to whitelist, so were already reaching the
# frontend before the wildcard listener existed
PREVIOUSLY_WHITELISTED = {
    "HEARTBEAT",
    "STATUSTEXT",
    "GLOBAL_POSITION_INT",
    "VFR_HUD",
    "BATTERY_STATUS",
    "ATTITUDE",
    "ALTITUDE",
    "NAV_CONTROLLER_OUTPUT",
    "SYS_STATUS",
    "GPS_RAW_INT",
    "GPS2_RAW",
    "RC_CHANNELS",
    "MISSION_CURRENT",
    "EKF_STATUS_REPORT",
    "VIBRATION",
}


def test_wildcard_listener_receives_unregistered_messages(droneStatus) -> None:
    """A message with no named listener reaches the wildcard listener"""
    drone = droneStatus.drone
    received: List[Any] = []

    drone.addMessageListener(WILDCARD_MESSAGE_LISTENER, received.append)
    try:
        drone.message_queue.put(["SOME_UNREGISTERED_MSG", "payload"])
        deadline = time.time() + 3
        while not received and time.time() < deadline:
            time.sleep(0.05)
    finally:
        drone.removeMessageListener(WILDCARD_MESSAGE_LISTENER)

    assert received == ["payload"]


def test_named_listener_takes_precedence_over_wildcard(droneStatus) -> None:
    """A named listener still wins when one is registered for that message"""
    drone = droneStatus.drone
    named: List[Any] = []
    wildcard: List[Any] = []

    drone.addMessageListener("A_NAMED_MSG", named.append)
    drone.addMessageListener(WILDCARD_MESSAGE_LISTENER, wildcard.append)
    try:
        drone.message_queue.put(["A_NAMED_MSG", "payload"])
        deadline = time.time() + 3
        while not named and time.time() < deadline:
            time.sleep(0.05)
    finally:
        drone.removeMessageListener(WILDCARD_MESSAGE_LISTENER)
        drone.removeMessageListener("A_NAMED_MSG")

    assert named == ["payload"]
    assert wildcard == []


def test_dashboard_forwards_previously_dropped_messages(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    """The dashboard reaches message types the old whitelist used to drop."""
    socketio_client.emit("set_state", {"state": "dashboard"})
    socketio_client.get_received()

    drone = droneStatus.drone
    original = drone.message_listeners.get(WILDCARD_MESSAGE_LISTENER)
    assert original is not None

    seen: set = set()

    def collect(msg) -> None:
        seen.add(msg.get_type())
        original(msg)

    drone.message_listeners[WILDCARD_MESSAGE_LISTENER] = collect
    try:
        deadline = time.time() + 8
        while time.time() < deadline and not (seen - PREVIOUSLY_WHITELISTED):
            time.sleep(0.1)
    finally:
        drone.message_listeners[WILDCARD_MESSAGE_LISTENER] = original

    assert seen, "no messages reached the wildcard listener at all"
    # Assert on set membership rather than one specific type, since which
    # messages a given SITL build emits varies
    assert seen - PREVIOUSLY_WHITELISTED, (
        f"expected at least one newly forwarded message type, only saw {sorted(seen)}"
    )


def test_reserved_messages_still_reach_controllers(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    """The wildcard listener must not steal messages reserved by controllers."""
    socketio_client.emit("set_state", {"state": "dashboard"})
    socketio_client.get_received()
    assert WILDCARD_MESSAGE_LISTENER in droneStatus.drone.message_listeners

    # A param fetch round trip depends on PARAM_VALUE reaching the params
    # controller through its reservation rather than the wildcard
    socketio_client.emit("set_multiple_params", [])
    result = socketio_client.get_received()
    assert result, "no response to a controller driven request"


def test_sendMessage_serialises_bytearray_fields(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    """Byte array fields must not blow up the JSON encoder.

    Forwarding every message means types like AUTOPILOT_VERSION, whose uid2
    field is a bytearray, now reach the emitter.
    """

    class FakeMessage:
        _timestamp = 1700000000.0

        def to_dict(self):
            return {
                "mavpackettype": "FAKE_WITH_BYTES",
                "uid2": bytearray([1, 2, 3]),
                "raw": b"\x04\x05",
                "count": 7,
            }

    sendMessage(FakeMessage())


def test_executeMessages_survives_a_failing_listener(droneStatus) -> None:
    """A listener that raises must not kill the dispatch thread"""
    drone = droneStatus.drone
    delivered: List[Any] = []

    def explode(msg) -> None:
        raise RuntimeError("listener blew up")

    drone.addMessageListener("A_FAILING_MSG", explode)
    drone.addMessageListener("A_LATER_MSG", delivered.append)
    try:
        drone.message_queue.put(["A_FAILING_MSG", "boom"])
        drone.message_queue.put(["A_LATER_MSG", "still here"])

        deadline = time.time() + 3
        while not delivered and time.time() < deadline:
            time.sleep(0.05)
    finally:
        drone.removeMessageListener("A_FAILING_MSG")
        drone.removeMessageListener("A_LATER_MSG")

    assert delivered == ["still here"], "dispatch thread stopped after a failure"
