from flask_socketio import SocketIOTestClient

from app.drone import WILDCARD_MESSAGE_LISTENER
from app.endpoints.states import GLOBAL_MESSAGE_LISTENERS
from app.utils import sendMessage

from .helpers import NoDrone, send_and_receive


def test_setState_no_drone_connection(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    """Test that setState succeeds when no drone is connected"""
    with NoDrone():
        socketio_client.emit("set_state", {"state": "dashboard"})
        assert len(socketio_client.get_received()) == 0
        assert droneStatus.state == "dashboard"


def test_setState_missing_state_parameter(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    """Test that setState fails when state parameter is missing"""
    assert send_and_receive("set_state", {}) == {
        "message": "Request to endpoint set_state missing value for parameter: state."
    }


def test_setState_dashboard_state(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    """Test setting state to dashboard"""
    socketio_client.emit("set_state", {"state": "dashboard"})
    assert len(socketio_client.get_received()) == 0
    # The dashboard forwards every message via the wildcard listener rather than
    # registering a named listener per message, so only the globals are named
    assert len(droneStatus.drone.message_listeners) == len(GLOBAL_MESSAGE_LISTENERS) + 1
    assert droneStatus.drone.message_listeners[WILDCARD_MESSAGE_LISTENER] is sendMessage


def test_setState_wildcard_only_on_dashboard(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    """Test that the forward-everything listener is confined to the dashboard"""
    socketio_client.emit("set_state", {"state": "dashboard"})
    socketio_client.get_received()
    assert WILDCARD_MESSAGE_LISTENER in droneStatus.drone.message_listeners

    for state in ("graphs", "missions", "config.rc", "config.servo"):
        socketio_client.emit("set_state", {"state": state})
        socketio_client.get_received()
        assert WILDCARD_MESSAGE_LISTENER not in droneStatus.drone.message_listeners, (
            f"wildcard listener should be cleared on {state}"
        )


def test_setState_graphs_state(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    """Test setting state to graphs"""
    droneStatus.drone.message_listeners = {}

    socketio_client.emit("set_state", {"state": "graphs"})
    assert len(socketio_client.get_received()) == 0
    assert len(droneStatus.drone.message_listeners) == 6


def test_setState_config_flight_modes_state(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    """Test setting state to config.flight_modes"""
    droneStatus.drone.message_listeners = {}

    socketio_client.emit("set_state", {"state": "config.flight_modes"})
    assert len(socketio_client.get_received()) == 0
    assert len(droneStatus.drone.message_listeners) == 5


def test_setState_config_rc_state(
    socketio_client: SocketIOTestClient, droneStatus
) -> None:
    """Test setting state to config.rc"""
    droneStatus.drone.message_listeners = {}

    socketio_client.emit("set_state", {"state": "config.rc"})
    assert len(socketio_client.get_received()) == 0
    assert len(droneStatus.drone.message_listeners) == 5
