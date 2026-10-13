# Media

GIFs for the top-level README and the mod READMEs. Each clip is 5 to 10 seconds, loops cleanly, and is under 5 MB so GitHub shows it inline.

## Clips to record

| File | Mod | What it shows |
| :-- | :-- | :-- |
| `hero.gif` | fence, then a game | The hero at the top of the README. Claude tries an edit outside the fence and the refusal row appears, then `/snake` or `/2048` opens a pane beside the transcript while Claude keeps working. |
| `snake.gif` | snake | `/snake` opens the pane, a few turns with w a s d, the snake eats twice, then hits a wall and the high score line updates. |
| `2048.gif` | game-2048 | `/2048` opens the board, four or five slides that merge tiles, one undo, and the best score. |
| `fence.gif` | fence | `/fence src/`, then ask Claude to change a file outside `src/`. The edit is refused with the reason, and Claude explains instead of editing. |
| `tripwire.gif` | tripwire | Ask Claude to put a key in a config file. The edit is held with the question, the default answer is refuse, and the secret itself is never printed. |
| `pairs.gif` | pairs | `/pairs`, a few turns by letter, one match, and the clock running in the header. |

Before recording:

- **Use a fake key for `tripwire.gif`.** Make one up that matches a real key's shape, for example an AWS-style `AKIA` followed by 16 made-up capitals and digits. Never record a real secret, even one you plan to revoke: a GIF can't be redacted after it's public.
- Use a clean project with nothing private in the file tree, the prompt history, or the status line.
- Make the terminal about 100 columns by 30 rows, with a font large enough to read when the GIF is scaled down.
- Start recording just before the action and stop just after it. Trim in the conversion step rather than recording again.

## Convert a recording to a GIF

Record with any screen recorder (on macOS, Cmd+Shift+5 saves a `.mov`). Then convert with [ffmpeg](https://ffmpeg.org/) using a palette made from the clip itself, which keeps text sharp and the file small:

```bash
ffmpeg -ss 2 -t 8 -i recording.mov -vf "fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5" -loop 0 snake.gif
```

- `-ss 2 -t 8` starts 2 seconds in and keeps 8 seconds. Adjust both to trim the clip to 5 to 10 seconds.
- `fps=12` and `scale=800:-1` set the frame rate and the width in pixels. The height follows the width.
- `-loop 0` loops forever.

Check the size:

```bash
ls -lh snake.gif
```

If it's over 5 MB, lower the frame rate to 10, then the width to 640, and convert again. Shortening the clip helps most.

Put the finished GIFs in this directory. To show one in a mod's README, copy it to `mods/<name>/screenshots/` and link it from there, as the pull request template asks.
