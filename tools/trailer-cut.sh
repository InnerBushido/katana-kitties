#!/usr/bin/env bash
#
# Cuts the Katana Kitties trailer.
#
#   node tools/trailer-score.mjs out/trailer/score.wav   # the music, first
#   bash tools/trailer-cut.sh                            # then the picture
#   bash tools/trailer-cut.sh --audio                    # only the soundtrack
#
# --audio RE-LAYS THE SCORE ON THE PICTURE THAT IS ALREADY CUT, and it exists
# because the picture is the expensive half and the soundtrack is the half that
# gets iterated. Recasting the narrator changes not one pixel; re-rendering
# thirteen crf-17 segments to prove it is minutes of CPU for a bit-identical
# result. The final stitch below was always a stream copy plus an audio mux, so
# this simply starts from there. It needs out/trailer/seg/ to still hold the
# segments from a full run — it says so and stops if they are gone.
#
# Inputs, all under out/trailer/:
#   shots/sNN.png   the keyframe for shot NN   (generated art)
#   clips/cNN.mp4   the animated shot NN       (optional)
#   score.wav       the music
#   cross.png       the drawn 十; this script regenerates it, see below
#
# EVERY SHOT FALLS BACK TO ITS STILL. If clips/cNN.mp4 is missing the script
# does a slow push-in on shots/sNN.png instead of failing, which means the
# whole edit can be assembled and watched before a single second of video has
# finished rendering, and a shot that comes back wrong can be dropped by
# deleting one file rather than by editing this script. Prefer a rule that
# degrades over one that vanishes.
#
# The timings here are the same numbers as the arrangement in
# tools/trailer-score.mjs. Change one and you must change the other: twelve
# shots of SHOT seconds, then TITLE seconds of the real key art.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=out/trailer
SEG=$OUT/seg
W=1920; H=1080; FPS=30
SHOT=5          # seconds per shot
TITLE=8         # seconds of title card
TITLE_FADE=6.6  # TITLE minus 1.4; spelled out because this machine has no bc
LATIN='C\:/Windows/Fonts/ariblk.ttf'

# THERE IS NO JAPANESE FONT IN THIS SCRIPT ANY MORE. See tools/brush-kanji.mjs
# for the long version: every Japanese face Windows ships is a geometric sans,
# drawtext cannot ask a .ttc for a heavier weight, and 十 set in any of them
# reads as a plus sign at any size and any border weight. The one place the
# trailer needs that glyph, it draws it.
GLYPH=$OUT/cross.png

# Sound-only rerun: skip straight to the stitch. Checked BEFORE the glyph is
# redrawn and before the segments are deleted, because both are picture.
AUDIO_ONLY=0
if [ "${1:-}" = "--audio" ]; then
  AUDIO_ONLY=1
  if ! ls "$SEG"/[0-9][0-9].mp4 >/dev/null 2>&1; then
    echo "--audio needs the cut segments in $SEG. Run without it first." >&2
    exit 1
  fi
fi

if [ "$AUDIO_ONLY" = 0 ]; then
node tools/brush-kanji.mjs "$GLYPH"

mkdir -p "$SEG"
rm -f "$SEG"/*.mp4

# THE RUNNING ORDER IS NOT THE FILE NUMBERING. Shot 12 — the eight Kotodama
# orbs — was cut in after the fact and belongs in the middle, beside the other
# two shots about what the orbs are for. Renumbering the files to suit would
# have invalidated every job id and prompt recorded in SHOTLIST.md, so the cut
# carries an order and the files keep their names.
order=( 1 2 3 4 5 6 7 12 8 9 10 11 )

# The copy, BY SHOT NUMBER. The first shot and the last are deliberately clean:
# the first has to land as a place and the last as a promise, and a caption on
# either reads as a slide rather than as a film.
declare -A cap=(
  [1]=""
  [2]="A WORLD THAT FLOATS"
  [3]="KNOCK OVER EVERYTHING"
  [4]="RIDE ANYTHING"
  [5]="EVEN THE DRAGONS"
  [6]="WALK A UNIT CIRCLE"
  [7]="BECOME THE POINT"
  [12]="EIGHT KOTODAMA ORBS"
  [8]="UP TO FOUR PLAYERS"
  [9]="ONE CHAMPION"
  [10]=""
  [11]=""
)

# Fade the caption up at 0.6s and out by 4.6s, so it never collides with a cut.
ALPHA="if(lt(t,0.6),0,if(lt(t,0.95),(t-0.6)/0.35,if(lt(t,4.2),1,max(0,(4.6-t)/0.4))))"

slot=0
for i in "${order[@]}"; do
  slot=$((slot + 1))
  n=$(printf "%02d" "$i")
  pos=$(printf "%02d" "$slot")     # where it sits in the cut, not in the list
  clip="$OUT/clips/c$n.mp4"
  still="$OUT/shots/s$n.png"
  text="${cap[$i]}"

  draw=""
  if [ -n "$text" ]; then
    draw=",drawtext=fontfile='$LATIN':text='$text':fontsize=62:fontcolor=white"
    draw="$draw:borderw=7:bordercolor=black@0.9:shadowx=0:shadowy=5"
    draw="$draw:shadowcolor=black@0.45:x=(w-tw)/2:y=h-205:alpha='$ALPHA'"
  fi

  # THE CROSS SLASH CARD IS TWO LINES, NOT ONE, and the top line is a picture.
  # Setting 十 inline with the words puts a 62px kanji beside 62px Arial Black
  # and the one glyph that is supposed to BE the move disappears into the line.
  # Stacked and half again as big it survives the line, but only as a plus sign
  # — see brush-kanji.mjs for the four things tried before giving up on type.
  # So the words are set and the kanji is drawn, overlaid, fading on the same
  # curve as the caption underneath it.
  over=""
  if [ "$i" = "10" ]; then
    draw=",drawtext=fontfile='$LATIN':text='CROSS SLASH':fontsize=62:fontcolor=white"
    draw="$draw:borderw=7:bordercolor=black@0.9:shadowx=0:shadowy=5"
    draw="$draw:shadowcolor=black@0.45:x=(w-tw)/2:y=h-205:alpha='$ALPHA'"
    over="$GLYPH"
  fi

  if [ -f "$clip" ]; then
    src=( -i "$clip" )
    vf="scale=$W:$H:force_original_aspect_ratio=increase,crop=$W:$H,fps=$FPS"
    # HOLD THE LAST FRAME IF THE CLIP IS SHORT. Not every video model offers
    # five seconds — Seedance only does 4, 8 or 12 — and a short segment does
    # not just look wrong, it slides every later cut off the beat it was
    # scored to. `-frames:v` below trims a long one; this pads a short one.
    vf="$vf,tpad=stop_mode=clone:stop_duration=$SHOT"
  else
    echo "  shot $n: no clip yet, pushing in on the still"
    # -loop 1 WITHOUT a -t, plus -frames:v below. `-t` on the INPUT hands
    # zoompan 125 separate still frames and zoompan expands EVERY one of them
    # into d= frames, so the encoder throws away almost all of what it renders
    # and a five-second push-in takes a minute. One input frame, d= out.
    src=( -loop 1 -i "$still" )
    # Scale up first: zoompan crops iw/zoom from its INPUT, so a small input
    # makes the push-in visibly stair-step. 2560 is enough at 1080p and renders
    # in a third of the time 3840 did.
    vf="scale=2560:1440:force_original_aspect_ratio=increase,crop=2560:1440"
    vf="$vf,zoompan=z='min(zoom+0.0006,1.18)':d=$((SHOT*FPS))"
    vf="$vf:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=$FPS"
  fi

  # The first slot comes up from black; nothing else does, because a trailer
  # that fades between every shot has no cuts in it.
  if [ "$slot" = "1" ]; then vf="$vf,fade=t=in:st=0:d=0.8"; fi

  if [ -n "$over" ]; then
    # WHERE AND WHEN THE GLYPH GOES, AND WHY IT IS NOT IN THE MIDDLE.
    # For the first three quarters of a second this shot ALREADY DRAWS THE
    # KANJI: the burst is a screen-high cross in the orb's own pink, which is
    # what the animation was asked for. A second 十 on top of that is two
    # crosses fighting. So the drawn one waits until 1.5s, by which time the
    # burst has opened out into a white flare, and it comes up top left where
    # every frame from there on is clean sky — pressed on after the cut, like
    # a seal. It leaves with the caption.
    #
    # Those coordinates are fitted to THIS clip. Regenerate c10.mp4 and check
    # the corner before trusting them.
    #
    # The glyph carries its own outline and drop shadow in its alpha, so it
    # only needs scaling, fading and dropping on. `-frames:v` is what ends the
    # looped overlay input — with -loop 1 neither input terminates on its own.
    ffmpeg -v error -y "${src[@]}" -loop 1 -i "$over" -frames:v $((SHOT * FPS)) \
      -filter_complex "[0:v]$vf$draw[bg];\
[1:v]scale=-1:340,format=rgba,fade=t=in:st=1.5:d=0.4:alpha=1,\
fade=t=out:st=4.2:d=0.4:alpha=1[gl];\
[bg][gl]overlay=x=150:y=80,format=yuv420p" \
      -an -c:v libx264 -preset slow -crf 17 -r "$FPS" "$SEG/$pos.mp4"
  else
    ffmpeg -v error -y "${src[@]}" -frames:v $((SHOT * FPS)) \
      -vf "$vf$draw,format=yuv420p" \
      -an -c:v libx264 -preset slow -crf 17 -r "$FPS" "$SEG/$pos.mp4"
  fi
  printf "  slot %s = shot %s ok\n" "$pos" "$n"
done

# ---- the title card: the kids' own artwork, held and pushed into slowly ----
# The cream plate at the bottom of title_art.png is the menu's button panel and
# is empty by design, so the address goes there rather than on top of anything
# they drew.
ffmpeg -v error -y -loop 1 -i public/sprites/title_art.png -frames:v $((TITLE * FPS)) \
  -vf "scale=2560:1440:force_original_aspect_ratio=increase,crop=2560:1440,\
zoompan=z='min(zoom+0.00035,1.09)':d=$((TITLE*FPS)):x='iw/2-(iw/zoom/2)':\
y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=$FPS,\
drawtext=fontfile='$LATIN':text='PLAY FREE IN YOUR BROWSER':fontsize=34:\
fontcolor=0x2b1a12:x=(w-tw)/2:y=880:alpha='min(1,max(0,(t-0.8)/0.6))',\
drawtext=fontfile='$LATIN':text='katana-kitties.vercel.app':fontsize=44:\
fontcolor=0x8c2f1f:x=(w-tw)/2:y=926:alpha='min(1,max(0,(t-1.2)/0.6))',\
fade=t=in:st=0:d=0.35,fade=t=out:st=$TITLE_FADE:d=1.4,\
format=yuv420p" \
  -an -c:v libx264 -preset slow -crf 17 -r "$FPS" "$SEG/13.mp4"
echo "  slot 13 (title) ok"

fi   # end of the picture pass; --audio rejoins here

# ---- stitch, and lay the score under it ----
: > "$SEG/list.txt"
for f in "$SEG"/[0-9][0-9].mp4; do echo "file '$(basename "$f")'" >> "$SEG/list.txt"; done

ffmpeg -v error -y -f concat -safe 0 -i "$SEG/list.txt" -i "$OUT/score.wav" \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest \
  -movflags +faststart "$OUT/katana-kitties-trailer.mp4"

# ---- the two copies anybody actually uses -------------------------------
# The concat above is a stream copy of thirteen crf-17 segments and lands
# around 140MB: right for an archive, wrong for anything you would send.
#
# EVERY ANIMATED SHOT IS A 1280x720 SOURCE UPSCALED. The video model returns
# 720p, so the 1080p master carries no detail the clips did not have — what it
# carries is the title card and the still fallbacks, which are real 1080p. That
# is why the upload copy is only crf 22 and why a 720p copy loses almost
# nothing: there is nothing above 720 in most of the frame to lose.
#
# The mild hqdn3d is aimed at the model's own dither. Flat cel art with hard
# ink lines compresses badly when every flat area is quietly noisy, and taking
# that out is worth about a third of the file with nothing visible going with
# it.
ffmpeg -v error -y -i "$OUT/katana-kitties-trailer.mp4"   -vf "hqdn3d=1.5:1.2:4:4" -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p   -c:a aac -b:a 160k -movflags +faststart "$OUT/katana-kitties-trailer-web.mp4"

# 720p, for showing it inside the game and for sending to a phone.
ffmpeg -v error -y -i "$OUT/katana-kitties-trailer.mp4"   -vf "scale=1280:720,hqdn3d=1.5:1.2:5:5"   -c:v libx264 -preset slow -crf 25 -pix_fmt yuv420p   -c:a aac -b:a 128k -movflags +faststart "$OUT/katana-kitties-trailer-720.mp4"

# ---- and the copy that ships INSIDE the game ----------------------------
# public/trailer/ is the only video in the repo and the only export that is
# committed, so it is made HERE rather than by hand. Nothing else in the
# project recorded how it had been encoded, and "whatever was typed that day"
# is not a build step — the next person to recast the narrator would have had
# to guess, and would have guessed a different bitrate.
#
# crf 28 against the phone copy's 25, because this one is watched once, in a
# browser, on whatever wifi is in the room, and every megabyte is a megabyte of
# somebody's first impression. It is still the largest file in the repo by a
# factor of forty.
mkdir -p public/trailer
ffmpeg -v error -y -i "$OUT/katana-kitties-trailer.mp4"   -vf "scale=1280:720,hqdn3d=1.5:1.2:5:5"   -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p   -c:a aac -b:a 112k -movflags +faststart public/trailer/katana-kitties-trailer.mp4

# THE POSTER IS THE TITLE CARD, NOT FRAME ONE. Frame one is a fade in from
# black, and a black poster is indistinguishable from a video that failed to
# load — which is exactly the wrong first impression for a player who has just
# been told the file is eighteen megabytes and asked whether she wants it.
ffmpeg -v error -y -ss 63 -i "$OUT/katana-kitties-trailer.mp4"   -frames:v 1 -vf scale=1280:720 -q:v 3 public/trailer/poster.jpg

for f in "$OUT"/katana-kitties-trailer*.mp4 public/trailer/katana-kitties-trailer.mp4; do
  printf "%-46s %5s s  %4d MB
" "$f"     "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f" | cut -d. -f1)"     "$(( $(stat -c%s "$f") / 1048576 ))"
done
