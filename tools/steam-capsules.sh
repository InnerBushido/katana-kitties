#!/usr/bin/env bash
#
# The SECOND Steam art set: the store capsules, built out of the generated
# key art in out/trailer/shots/ with the kids' own wordmark laid over it.
#
#   node tools/steam-art.mjs        # first: makes out/steam/logo.png
#   bash tools/steam-capsules.sh    # then: the capsules
#
# WHY THIS EXISTS ALONGSIDE steam-art.mjs, WHICH SAYS NOT TO DO THIS.
# That tool's header argues that a prompt to an image model "would put art on
# the box that is nowhere inside it", and it is right about the SHELF — the
# library cover and the desktop icon stand in for the game you already own, and
# those must be the game. The store page is a different job: it has to show
# somebody who has never seen this what is in it, across nine crops from
# 462x174 to 3840x1240, and there is exactly one painting in the repo to cut
# them all from. Richard asked for the generated set on 2026-08-21 and it is
# additive: nothing here overwrites out/steam/, and the shelf is still the
# kids' painting.
#
# THE WORDMARK IS NEVER GENERATED. Every capsule that carries the name carries
# out/steam/logo.png, which steam-art.mjs cuts from title_art.png with measured
# coordinates. A model's idea of the lettering would be the one part of this
# that is a forgery of the kids' work. Second non-negotiable.
set -euo pipefail
cd "$(dirname "$0")/.."

SHOTS=out/trailer/shots
LOGO=out/steam/logo.png
OUT=out/steam/capsules

if [ ! -f "$LOGO" ]; then
  echo "no $LOGO — run: node tools/steam-art.mjs" >&2
  exit 1
fi

mkdir -p "$OUT/screenshots"

# fill <src> <w> <h> <focus-x 0..1> <out> [extra filters]
# Crop to fill, keeping the interesting part. The portrait capsules cut a
# 600-wide slice out of a 2752-wide painting, so "centre" is usually wrong —
# every call names where the subject actually is.
fill() {
  local src=$1 w=$2 h=$3 fx=$4 dst=$5 extra=${6:-}
  ffmpeg -v error -y -i "$src" \
    -vf "scale=$w:$h:force_original_aspect_ratio=increase,\
crop=$w:$h:x='max(0,min(in_w-$w,in_w*$fx-$w/2))':y='(in_h-$h)/2'${extra:+,$extra}" \
    -q:v 2 "$dst"
}

# name <bg> <w> <h> <logo-width-fraction> <logo-y-fraction> <out>
# The same crop, with the wordmark over it. The logo is 1280x317 with alpha.
name() {
  local src=$1 w=$2 h=$3 fx=$4 lw=$5 ly=$6 dst=$7
  local lpx=$(( w * lw / 100 ))
  ffmpeg -v error -y -i "$src" -i "$LOGO" \
    -filter_complex "[0]scale=$w:$h:force_original_aspect_ratio=increase,\
crop=$w:$h:x='max(0,min(in_w-$w,in_w*$fx-$w/2))':y='(in_h-$h)/2'[bg];\
[1]scale=$lpx:-1[lg];\
[bg][lg]overlay=x=(W-w)/2:y='H*$ly/100-h/2'" \
    -q:v 2 "$dst"
}

echo "capsules ->"

# --- the store, in Steam's own names and sizes ------------------------------
# The hero and the page background carry NO wordmark: Steam draws library-logo
# over the hero itself, and a name on the page background sits behind the whole
# store page and reads as a mistake.
fill "$SHOTS/s01.png" 3840 1240 0.50 "$OUT/library-hero.jpg"
fill "$SHOTS/s08.png" 1438  810 0.50 "$OUT/page-background.jpg" "eq=brightness=-0.10:saturation=0.85"

name "$SHOTS/s02.png"  600  900 0.62 80 17 "$OUT/library-capsule.jpg"
name "$SHOTS/s05.png"  748  896 0.55 82 22 "$OUT/vertical-capsule.jpg"
name "$SHOTS/s11.png" 1232  706 0.50 74 24 "$OUT/main-capsule.jpg"
name "$SHOTS/s11.png"  920  430 0.50 80 26 "$OUT/header-capsule.jpg"
name "$SHOTS/s10.png"  462  174 0.50 74 34 "$OUT/small-capsule.jpg"

# Steam wants the library logo as its own transparent PNG, at most 1280x720,
# and draws it over the hero wherever the store settings say.
ffmpeg -v error -y -i "$LOGO" \
  -vf "scale=1280:-1,pad=1280:720:0:(720-ih)/2:color=0x00000000" \
  -c:v png -pix_fmt rgba "$OUT/library-logo.png"

# --- the screenshots -------------------------------------------------------
# All twelve shots, in running order, at the size Steam wants. These are the
# same frames the trailer is cut from, which is the point: the store should not
# promise anything the trailer does not show.
i=0
for n in 01 02 03 04 05 06 07 12 08 09 10 11; do
  i=$((i + 1))
  fill "$SHOTS/s$n.png" 1920 1080 0.50 "$(printf '%s/screenshots/%02d.jpg' "$OUT" "$i")"
done

ls -1 "$OUT" "$OUT/screenshots" | sed 's/^/  /'
echo "  -> $OUT"
