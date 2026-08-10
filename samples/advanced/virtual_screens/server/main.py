"""Initializes and runs the WebSocket service."""

import asyncio
import inspect
import logging
import platform
from typing import Any, Dict

import websockets.server

from websocket_manager import WebSocketManager
from stream_manager import StreamManager

# Define the port for the WebSocket server.
WEBSOCKET_PORT = 8765


async def main():
  """Sets up and starts the server components."""
  logging.basicConfig(
      level=logging.INFO,
      format='%(asctime)s - %(levelname)s - %(message)s',
  )

  stream_manager = StreamManager()

  # Client requests use these names as the 'target' to route calls.
  managers = {
      'streamManager': stream_manager,
  }

  async def handle_client_request(
      websocket: websockets.server.WebSocketServerProtocol,
      data: Dict[str, Any],
  ) -> Any:
    """
    Handles an incoming JSON-RPC request from a client by routing it to the
    appropriate manager and method.
    """
    params = data.get('params', {})
    target_name = params.get('target')
    func_name = params.get('func')
    args = params.get('args', [])

    if not all((target_name, func_name)):
      raise ValueError('Request must include "target" and "func".')

    manager = managers.get(target_name)
    if not manager:
      raise NameError(f'No manager registered with name "{target_name}".')

    method = getattr(manager, func_name, None)
    if not method or not callable(method):
      raise NameError(f'Method "{func_name}" not found on "{target_name}".')

    # Only pass the `websocket` object only if the method expects it.
    method_params = inspect.signature(method).parameters
    pass_websocket = 'websocket' in method_params
    call_args = (websocket, *args) if pass_websocket else args

    if asyncio.iscoroutinefunction(method):
      return await method(*call_args)
    else:
      return await asyncio.to_thread(method, *call_args)

  websocket_manager = WebSocketManager(
      WEBSOCKET_PORT,
      request_handler=handle_client_request,
      binary_handler=stream_manager.forward_binary_data,
      disconnect_handler=stream_manager.handle_disconnect,
  )

  # Provide the StreamManager with a reference to the WebSocketManager so it
  # can send RPC calls back to the client.
  stream_manager.set_websocket_manager(websocket_manager)

  try:
    await websocket_manager.start()
    logging.info(
        'Server is running on port %d. To connect a device, run "adb reverse'
        ' tcp:%d tcp:%d". Press Ctrl+C to stop.',
        WEBSOCKET_PORT,
        WEBSOCKET_PORT,
        WEBSOCKET_PORT,
    )
    await asyncio.Future()
  except (KeyboardInterrupt, asyncio.CancelledError):
    logging.info('Server is shutting down.')
  except Exception:
    logging.exception('An unexpected error occurred.')
  finally:
    await websocket_manager.stop()


if __name__ == '__main__':
  # A known issue on Windows requires the ProactorEventLoop for graceful
  # server shutdown of asyncio-based servers.
  if platform.system() == 'Windows':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

  asyncio.run(main())
