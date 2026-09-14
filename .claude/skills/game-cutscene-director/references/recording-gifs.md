# Recording GIFs and clips out of a running game

The clip should be **the game playing itself**. A script drives the real game
through a performance, grabs each frame from the renderer, and hands the frames
to an encoder. Nothing in that pipeline can invent a frame, so a clip can't
misrepresent the game, and a change that breaks the behaviour visibly breaks
the clip.

## The rig

| part | job |
| --- | --- |
| harness (in-page / in-editor) | boots the game, synthesises input, teleports actors, pins cameras, steps the world at a fixed dt, reads frames |
| shot kit | the drive loop: `run(ms, plan, {caption})` beats; drawn overlays (input panels) |
| bridge (localhost server) | receives frames, calls the encoder, serves repo files to the page |
| encoder | GIF89a with interframe differencing; a self-test reads its own output back |
| peek/decoder | reads a finished GIF's frame count, delays and PNG dumps, so you check it instead of trusting it |
| `shots/*.js` | one file per clip. **Check it in**: the script is the only thing that can re-cut a clip |

## Must-dos

1. **Take the loop away from the browser.** Call `renderer.setAnimationLoop(null)`,
   step at a fixed dt, and stub the clock. A hidden tab throttles rAF, and
   `setAnimationLoop` *is* rAF.
2. **Read the back buffer**: `gl.readPixels` with a Y-flip, straight after
   render. `drawImage(canvas)` is compositor-gated and returns stale pixels.
3. **Pin the camera**, and pin every camera the renderer might select. With
   interframe differencing, cost tracks how much the frame changes, not frame
   count: about 2.3 KB/frame pinned versus about 4× that flying.
4. **Use `dither: false`**, or the diff finds noise everywhere.
5. **Film big, publish small**: capture at about 936 px wide and encode at 512
   (the averaging acts as anti-aliasing). A common standard is 640×362, 18 fps,
   256 colours. Encoding one master at several sizes is cheap; re-shooting is
   not.
6. **Look at 6 frames before encoding** a multi-minute take.
7. **Measure sizes from the file header**, never from the script, and cap each
   file (e.g. 2.5 MB). A wrong width/height reflows the page when the image
   loads.

## Directing a teaching clip

- **One idea per beat, one caption per beat.**
- **A caption stays on screen longer than its action**: a young reader reads
  word by word. This was the most common note.
- **A pause is played, not frozen.** Drop to about 11 fps rather than holding
  one frame; a frozen frame reads as broken. The exception is a final frame
  with a caption.
- **Where the game already directs a moment cinematically, use the game's
  camera** rather than re-staging it.
- **Raising a look-at target lowers the subject.**
- **Motion along the screen-right vector** changes only NDC x, so the subject
  stays the same size.
- **Find out what part of the frame is yours** (touch controls own the lower
  half) before choosing a camera.
- **Trigger beats off state** ("is she facing across the frame with room ahead?")
  with a frame-count fallback, not off frame numbers.
- **Measure movement per frame** (e.g. a sprint covers 1.03 units per capture
  frame) instead of deriving it.
- **Paired clips shown side by side** must match fps and frame count, and loop
  together. Sync by padding the shorter one's *last* frame, and check each
  delay individually.

## Overlays

`readPixels` sees only the canvas. For HUD, menus or touch pads, redraw them
onto each captured frame from the live DOM (`getBoundingClientRect`,
`getComputedStyle`, box-shadow parsing). Don't pull in a rasteriser library.
During the take:
- inject `transition: none !important`, because CSS transitions only advance on
  painted frames;
- real sleeps between gesture beats, because detectors run on wall-clock time;
- un-hide anything you measure, because hidden elements measure zero.

## Unity / other engines

The same rules apply. Step with `Time.captureDeltaTime` (or a fixed-timestep
loop), read frames from a RenderTexture via `AsyncGPUReadback` straight after
render, pin the Cinemachine brain to a fixed vcam, and encode offline. UI Toolkit
and uGUI in Screen Space - Overlay are not in the camera's render texture: use
Screen Space - Camera for the take, or composite the UI.
