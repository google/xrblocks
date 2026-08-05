"""Manages the WebSocket server and client communication."""

import json
import logging
from typing import Any, Awaitable, Callable, Dict

import websockets
import websockets.exceptions
import websockets.server

# Type aliases for the request handlers.
RequestHandler = Callable[
    [websockets.server.WebSocketServerProtocol, Dict[str, Any]],
    Awaitable[Any],
]
BinaryHandler = Callable[
    [websockets.server.WebSocketServerProtocol, bytes], Awaitable[None]
]
DisconnectHandler = Callable[
    [websockets.server.WebSocketServerProtocol], Awaitable[None]
]


class WebSocketManager:
  """Handles the WebSocket server, client connections, and JSON-RPC messaging."""

  def __init__(
      self,
      port: int,
      request_handler: RequestHandler,
      binary_handler: BinaryHandler,
      disconnect_handler: DisconnectHandler,
  ):
    """Initializes the WebSocketManager."""
    self._port = port
    self._request_handler = request_handler
    self._binary_handler = binary_handler
    self._disconnect_handler = disconnect_handler
    self._websocket_server: websockets.server.Serve | None = None
    self._clients: set[websockets.server.WebSocketServerProtocol] = set()

  async def start(self):
    """Starts the WebSocket server."""
    if self._websocket_server:
      logging.warning('WebSocket server is already running.')
      return
    try:
      # Increase the max message size to handle large video keyframes.
      server = await websockets.serve(
          self._connection_handler,
          'localhost',
          self._port,
          max_size=16 * 1024 * 1024,
      )
      self._websocket_server = server
      logging.info('WebSocket server started on ws://localhost:%d', self._port)
    except OSError as e:
      logging.error('Failed to start WebSocket server: %s', e)
      raise

  async def stop(self):
    """Stops the WebSocket server."""
    if self._websocket_server:
      self._websocket_server.close()
      await self._websocket_server.wait_closed()
      self._websocket_server = None
      logging.info('WebSocket server stopped.')

  async def _connection_handler(
      self, websocket: websockets.server.WebSocketServerProtocol
  ):
    """Handles a new client connection and manages its lifecycle."""
    logging.info(
        'Client connected to WebSocket from %s.', websocket.remote_address
    )
    self._clients.add(websocket)
    try:
      async for message in websocket:
        await self._message_router(websocket, message)
    except websockets.exceptions.ConnectionClosed as e:
      logging.info(
          'Client connection closed from %s. Code: %d, Reason: %s.',
          websocket.remote_address,
          e.code,
          e.reason,
      )
    finally:
      self._clients.remove(websocket)
      if self._disconnect_handler:
        await self._disconnect_handler(websocket)
      logging.info('Client %s disconnected.', websocket.remote_address)

  async def _message_router(
      self,
      websocket: websockets.server.WebSocketServerProtocol,
      message: str | bytes,
  ):
    """Routes an incoming message to the appropriate handler."""
    if isinstance(message, bytes):
      if self._binary_handler:
        await self._binary_handler(websocket, message)
      return

    try:
      data = json.loads(message)
      if 'params' in data:
        await self._handle_rpc_request(websocket, data)
      else:
        logging.info('Ignoring non-request message: %s.', data)
    except json.JSONDecodeError:
      logging.error('Received non-JSON message: %s.', message)
    except Exception:
      logging.exception('Error processing message.')

  async def _handle_rpc_request(
      self,
      websocket: websockets.server.WebSocketServerProtocol,
      request_data: Dict[str, Any],
  ):
    """Handles a request from a client and sends a response if needed."""
    response = {'id': request_data.get('id')}
    try:
      result = await self._request_handler(websocket, request_data)
      response['result'] = result
    except Exception as e:
      logging.exception(
          'Error processing request %s: %s.', request_data.get('id', 'N/A'), e
      )
      response['error'] = str(e)

    # Only send a response if the request had an ID.
    if response['id']:
      await websocket.send(json.dumps(response))

  async def send_rpc_call(
      self,
      target: str,
      func: str,
      args: list[Any] | None = None,
      websocket: websockets.server.WebSocketServerProtocol | None = None,
  ):
    """Sends a one-way RPC call (notification) to a client."""
    client = websocket or next(iter(self._clients), None)
    if not client:
      logging.warning('No connected clients to send RPC call to.')
      return

    notification = {
        'params': {'target': target, 'func': func, 'args': args or []}
    }
    try:
      await client.send(json.dumps(notification))
    except websockets.exceptions.ConnectionClosed as e:
      logging.error('Failed to send RPC call to client: %s.', e)
