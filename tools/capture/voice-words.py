"""WHERE EVERY WORD IS, in every recorded line of a scene.

    python tools/capture/voice-words.py payne_intro      # every public/voice/**/payne_intro_*.mp3
    python tools/capture/voice-words.py payne_intro_12   # just the one that was re-recorded

Writes src/voicewords.json: for each voice id, the sha1 of the mp3 it was
measured from, its length, and its words as [text, start, end] in seconds.

WHY A FILE AND NOT A COMMENT. The intro's cues were measured by hand once
(faster-whisper, checked against silencedetect) and written as numbers with
the word in a comment beside them. That survives exactly until a line is
re-recorded: then every number on that line is wrong and nothing says so.
With the words in a file keyed by the recording's hash, the review page
(review.html) can tell that a line changed since a video was made, and place
a note on "Somebody" wherever "Somebody" now is.

THE STARTS RUN EARLY, SO THEY ARE MOVED TO THE SOUND. Whisper folds a pause
into the word after it: line 11's "...Second" came back as 2.60-3.66s, and
silencedetect (-32dB, 0.12s, the measure payneintro.js's header says wins)
has that line quiet from 2.93 to 3.46 — the hand cue for "Second" is 3.46.
So a word with a quiet run of at least 0.12s inside it starts where the run
ends. The first try, "move a start that has 50ms of quiet IN FRONT of it",
missed exactly this case: the tail of "was" is loud for the word's first
frames, then the pause, then the word. Only ever forward, never past the
word's end, and idempotent, so it runs on every line every time; only
whisper is skipped for unchanged recordings.

The quiet is measured on 10ms RMS, not on samples as silencedetect does:
line 12's pause before "Out" ENDS at 2.59 by silencedetect, on a lone noise
peak, while the RMS sits under -36dB until 2.77 and the word is -14dB at
2.78. Listening agrees with 2.78.

A CUT IS NOT A WORD. Line 12's "Out there" cut is at 2.28, whisper's raw
start, half a second before the word is heard; it is not moved by this.
Whether it should be is a director's note, made on the review page.

large-v3 on the CPU took 3 minutes for the intro's 114 seconds of speech. Only the
lines whose sha1 changed are re-measured unless --all is given.
"""
import hashlib, json, sys, subprocess
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
VOICE = ROOT / 'public' / 'voice'
OUT = ROOT / 'src' / 'voicewords.json'


def sha1(p):
    return hashlib.sha1(p.read_bytes()).hexdigest()


def duration(p):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(p)],
                       capture_output=True, text=True, check=True)
    return round(float(r.stdout.strip()), 3)


def loudness(p):
    """dB per 10ms frame, mono 16kHz."""
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(p), '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    n = len(x) // 160
    rms = np.sqrt(np.mean(x[:n * 160].reshape(n, 160) ** 2, axis=1) + 1e-12)
    return 20 * np.log10(rms)


QUIET_DB = -32     # dBFS, silencedetect's noise=-32dB
QUIET_RUN = 12     # frames of 10ms: silencedetect's d=0.12


def to_sound(words, db):
    out = []
    for w, a, b in words:
        i0, i1 = int(round(a * 100)), min(len(db), int(round(b * 100)) - 5)
        start, run = i0, 0
        for i in range(i0, i1):
            run = run + 1 if db[i] < QUIET_DB else 0
            # a pause inside the word, or 50ms of quiet at its very start
            if run >= QUIET_RUN or (run >= 5 and i - run + 1 == i0):
                start = i + 1
        # quiet to the end means whisper's edges are wrong some other way: leave it
        out.append([w, round(start / 100, 2) if i0 < start < i1 else a, b])
    return out


def main(args):
    force = '--all' in args
    pats = [a for a in args if not a.startswith('--')]
    if not pats:
        sys.exit(__doc__)
    files = sorted({p for pat in pats for p in VOICE.rglob(f'{pat}*.mp3')
                    if p.stem == pat or p.stem.startswith(pat + '_') or pat.endswith('_')},
                   key=lambda p: (p.stem.rstrip('0123456789'), int(''.join(c for c in p.stem if c.isdigit()) or 0)))
    if not files:
        sys.exit(f'no mp3 under public/voice matches {pats}')
    table = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    todo = [p for p in files if force or table.get(p.stem, {}).get('sha1') != sha1(p)]
    if todo:
        from faster_whisper import WhisperModel
        # CPU on purpose: 'auto' picks CUDA on this machine and then dies
        # wanting cublas64_12.dll, which the GPU driver does not ship.
        model = WhisperModel('large-v3', device='cpu', compute_type='int8')
    for p in todo:
        segs, _ = model.transcribe(str(p), language='en', word_timestamps=True, beam_size=5)
        words = [[w.word.strip(), round(w.start, 2), round(w.end, 2)] for s in segs for w in s.words]
        table[p.stem] = {'sha1': sha1(p), 'dur': duration(p), 'words': words}
        print(f'{p.stem}: {len(words)} words, {table[p.stem]["dur"]}s')
    for p in files:
        if p not in todo:
            print(f'{p.stem}: unchanged')
        e = table[p.stem]
        moved = to_sound(e['words'], loudness(p))
        n = sum(1 for x, y in zip(e['words'], moved) if x[1] != y[1])
        if n:
            print(f'{p.stem}: {n} word starts moved to the sound')
        e['words'] = moved
    # one voice per line, sorted, so re-recording one line is a one-line diff
    keys = sorted(table, key=lambda k: (k.rstrip('0123456789'), int(''.join(c for c in k if c.isdigit()) or 0)))
    body = ',\n'.join(f'  {json.dumps(k)}: {json.dumps(table[k], ensure_ascii=False)}' for k in keys)
    OUT.write_text('{\n' + body + '\n}\n', encoding='utf-8', newline='\n')


if __name__ == '__main__':
    main(sys.argv[1:])
