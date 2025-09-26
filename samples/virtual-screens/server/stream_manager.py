from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any, Dict

if TYPE_CHECKING:
  # Avoids a circular dependency; only imported for type checking.
  from websocket_manager import WebSocketManager
  import websockets


class StreamManager:
  """Manages the lifecycle of multiple screen-sharing streams."""

  def __init__(self):
    """Initializes the StreamManager."""
    self._websocket_manager: WebSocketManager | None = None
    # Holds all active streams, keyed by stream_id.
    self._streams: Dict[str, Dict[str, Any]] = {}

  def set_websocket_manager(self, websocket_manager: WebSocketManager):
    """Sets a reference to the WebSocketManager for sending RPC calls."""
    self._websocket_manager = websocket_manager

  async def handle_disconnect(
      self, websocket: websockets.server.WebSocketServerProtocol
  ):
    """Cleans up streams associated with a disconnected client.

    Args:
      websocket: The WebSocket connection that has been closed.
    """
    streams_to_remove = []
    streams_to_notify: Dict[str, list] = {}
    for stream_id, stream_data in self._streams.items():
      # If the disconnected client was a sender, the entire stream is removed.
      if websocket == stream_data['sender']:
        logging.info(
            'Stream sender for stream %s disconnected. Removing stream.',
            stream_id,
        )
        streams_to_remove.append(stream_id)
        streams_to_notify[stream_id] = list(stream_data['receivers'])
      # If the client was a receiver, just remove it from the receivers set.
      elif websocket in stream_data['receivers']:
        stream_data['receivers'].remove(websocket)

    for stream_id, receivers in streams_to_notify.items():
      await self._notify_receivers_of_stream_end(stream_id, receivers)

    for stream_id in streams_to_remove:
      if stream_id in self._streams:
        del self._streams[stream_id]

  async def start_stream(
      self,
      websocket: websockets.server.WebSocketServerProtocol,
      stream_id: str,
      stream_info: Dict[str, Any],
  ):
    """Called by a sender to register a new stream."""
    if stream_id in self._streams:
      logging.warning(
          'New stream starting with an existing ID: %s. Overwriting.',
          stream_id,
      )
    logging.info('New stream started with ID: %s.', stream_id)
    self._streams[stream_id] = {
        'info': stream_info,
        'sender': websocket,
        'receivers': set(),
    }

  async def stop_stream(
      self, websocket: websockets.server.WebSocketServerProtocol, stream_id: str
  ):
    """Called by the sender to indicate the stream has ended."""
    if (
        stream_id in self._streams
        and self._streams[stream_id]['sender'] == websocket
    ):
      logging.info('Stream ended: %s.', stream_id)
      await self._notify_receivers_of_stream_end(
          stream_id, list(self._streams[stream_id]['receivers'])
      )
      del self._streams[stream_id]
    else:
      logging.warning(
          'Received stop_stream for unknown or invalid stream: %s.',
          stream_id,
      )

  async def get_active_streams(self) -> Dict[str, Any]:
    """Called by receivers polling for active streams.

    Returns:
        A dictionary of active streams, mapping stream_id to stream_info.
    """
    return {
        stream_id: stream['info'] for stream_id, stream in self._streams.items()
    }

  async def subscribe_to_stream(
      self, websocket: websockets.server.WebSocketServerProtocol, stream_id: str
  ):
    """Called by a receiver when it is ready to get video data for a stream."""
    if not self._websocket_manager:
      logging.error('WebSocketManager not set on StreamManager.')
      return

    stream = self._streams.get(stream_id)
    if stream and stream['sender']:
      logging.info('Receiver subscribed to stream %s.', stream_id)
      stream['receivers'].add(websocket)
      # Request a keyframe from the sender to begin the stream for this new
      # receiver.
      await self._websocket_manager.send_rpc_call(
          'streamManager',
          'triggerKeyFrame',
          args=[stream_id],
          websocket=stream['sender'],
      )
    else:
      logging.warning(
          'Receiver tried to subscribe to non-active stream: %s.', stream_id
      )

  async def _notify_receivers_of_stream_end(
      self, stream_id: str, receivers: list
  ):
    """Notifies all receivers of a stream that it has ended."""
    if not self._websocket_manager:
      logging.error('WebSocketManager not set; cannot notify receivers.')
      return

    if receivers:
      logging.info(
          'Notifying %d receivers that stream %s has ended.',
          len(receivers),
          stream_id,
      )
      tasks = [
          self._websocket_manager.send_rpc_call(
              'streamManager',
              'onStreamEnded',
              args=[stream_id],
              websocket=receiver,
          )
          for receiver in receivers
      ]
      await asyncio.gather(*tasks)

  async def forward_binary_data(
      self, websocket: websockets.server.WebSocketServerProtocol, data: bytes
  ):
    """
    Parses multiplexed binary video data, identifies the stream, and forwards
    the data to all subscribed receivers.
    """
    if not data:
      return

    try:
      # Protocol: [1-byte stream_id length][stream_id][rest of data...].
      stream_id_len = data[0]
      stream_id = data[1 : 1 + stream_id_len].decode('utf-8')
    except (IndexError, UnicodeDecodeError) as e:
      logging.error('Failed to parse stream_id from binary data header: %s.', e)
      return

    stream = self._streams.get(stream_id)
    if not stream or websocket != stream['sender']:
      return

    receivers = list(stream['receivers'])
    if not receivers:
      return

    # Concurrently send the data to all receivers for this specific stream.
    tasks = [client.send(data) for client in receivers]
    await asyncio.gather(*tasks, return_exceptions=True)
