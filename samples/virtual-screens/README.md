# Virtual Screens Sample

This sample showcases real-time screen sharing from a computer to an AndroidXR device. It uses a local Python WebSocket server to forward video streams, which are rendered onto interactive 3D panels in the XR environment. This sample uses a combination of **WebSockets** for transport and the **WebCodecs API** for video processing. Features of this sample include:

* **Multi-Stream**: Share multiple windows or screens simultaneously.
* **Low Latency**: Utilizes the WebCodecs API for efficient video encoding and decoding.
* **Interactivity**: Streams are displayed on draggable 3D panels.
* **Curved Display**: Optionally renders  streams on a curved surface.

To change default display size and curvature, please update the parameters of `WindowReceiver` in `js/main_receive.js`.

## Prerequisites

* Python 3.8+
* Android Debug Bridge (adb) installed and in your system's PATH.
* An AndroidXR device connected to your computer via USB.

## Running the application

1. Install dependencies:
   Open your terminal and install the required Python library.
    ```bash
    pip install websockets
    ```

2. Start the server:
   Run the main Python script to start the WebSocket server.
    ```bash
   python main.py
    ```
   The server will log a confirmation message, including the adb command needed for the next step.

3. Enable device connection:
   In a new terminal, run the adb reverse command printed by the server. This allows the AndroidXR device to connect to your computer's localhost.
   ```bash
   adb reverse tcp:8765 tcp:8765
   ```

4. Serve the web pages:
   The HTML files need to be served by a local HTTP server. The simplest way is to use the develop.sh script in the project's root directory. This uses port `8080` by default.
    ```bash
    sh develop.sh
    ````

5. Open sender and receiver:
   * *On your computer*, navigate to http://localhost:8080/samples/virtual-screens/send.html.
   * *On your AndroidXR device*, navigate to http://localhost:8080/samples/virtual-screens/index.html.

6. Start sharing:
   On the sender page (your computer), click the "Select Window or Screen to Share" button and choose the content you wish to stream. The stream will appear on your AndroidXR device.

## Implementation notes
* This sample uses WebSockets instead of WebRTC primarily because the `adb reverse` connection, commonly used for local development, only forwards TCP traffic. WebRTC primarily uses UDP, which the adb tunnel doesn't support unless you use a TURN server to relay TCP traffic. For devices on a stable Wi-Fi network, WebRTC would be a great alternative that could simplify the connection and streaming process.
* The visual quality of the stream on the AndroidXR device is influenced by WebXR's `framebufferScaleFactor`. You can increase this value in `main_receive.js` for a sharper image, but be aware that values greater than 1.0 may impact performance and cause lag.
* For testing purposes, if `index.html` is loaded on a computer without a WebSocket server connection, a prompt will appear to share a local screen, allowing for previewing the receiver experience directly in the simulator.
