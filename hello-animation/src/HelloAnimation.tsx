import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const OFF_WHITE = "#F7F4EE";
const TEXT_COLOR = "#1A1A1A";
const FONT_FAMILY =
  "Helvetica Neue, Helvetica, Arial, sans-serif";

const WORDS = [
  "This",
  "video",
  "was",
  "made",
  "with",
  "Remotion",
  "and",
  "Claude",
];

// Timing (in frames, 30fps)
const HELLO_ENTER_START = 0;
const HELLO_ENTER_DURATION = 25;
const HELLO_HOLD_DURATION = 90; // ~3s
const HELLO_EXIT_START =
  HELLO_ENTER_START + HELLO_ENTER_DURATION + HELLO_HOLD_DURATION;
const HELLO_EXIT_DURATION = 25;

const SENTENCE_START = HELLO_EXIT_START;
const WORD_STAGGER = 10;
const WORD_ENTER_DURATION = 20;
const SENTENCE_END =
  SENTENCE_START + (WORDS.length - 1) * WORD_STAGGER + WORD_ENTER_DURATION;

const EMOJI_START = SENTENCE_END + 15;
const EMOJI_ENTER_DURATION = 25;
const END_HOLD = 60;

export const TOTAL_DURATION_IN_FRAMES =
  EMOJI_START + EMOJI_ENTER_DURATION + END_HOLD;

export const HelloAnimation: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();

  const helloEnterProgress = spring({
    frame: frame - HELLO_ENTER_START,
    fps,
    durationInFrames: HELLO_ENTER_DURATION,
    config: { damping: 200 },
  });

  const helloExitProgress = spring({
    frame: frame - HELLO_EXIT_START,
    fps,
    durationInFrames: HELLO_EXIT_DURATION,
    config: { damping: 200 },
  });

  const helloEnterY = interpolate(helloEnterProgress, [0, 1], [-height, 0]);
  const helloExitY = interpolate(helloExitProgress, [0, 1], [0, height]);
  const helloY = helloEnterY + helloExitY;

  const helloOpacity = interpolate(
    frame,
    [HELLO_EXIT_START, HELLO_EXIT_START + HELLO_EXIT_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const emojiProgress = spring({
    frame: frame - EMOJI_START,
    fps,
    durationInFrames: EMOJI_ENTER_DURATION,
    config: { damping: 12, mass: 0.9 },
  });
  const emojiScale = interpolate(emojiProgress, [0, 1], [0, 1]);
  const emojiOpacity = interpolate(emojiProgress, [0, 1], [0, 1]);

  return (
    <AbsoluteFill style={{ backgroundColor: OFF_WHITE, fontFamily: FONT_FAMILY }}>
      {/* "Hello" layer */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ transform: `translateY(${helloY}px)`, opacity: helloOpacity }}>
          <h1 style={{ fontSize: 160, fontWeight: 700, color: TEXT_COLOR, margin: 0 }}>
            Hello
          </h1>
        </div>
      </AbsoluteFill>

      {/* Sentence layer, one word at a time */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 22 }}>
          {WORDS.map((word, i) => {
            const start = SENTENCE_START + i * WORD_STAGGER;
            const progress = spring({
              frame: frame - start,
              fps,
              durationInFrames: WORD_ENTER_DURATION,
              config: { damping: 200 },
            });
            const y = interpolate(progress, [0, 1], [-180, 0]);
            const opacity = interpolate(progress, [0, 1], [0, 1]);

            return (
              <span
                key={word}
                style={{
                  display: "inline-block",
                  transform: `translateY(${y}px)`,
                  opacity,
                  fontSize: 56,
                  fontWeight: 600,
                  color: TEXT_COLOR,
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      </AbsoluteFill>

      {/* Emoji layer, below the sentence */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            fontSize: 220,
            transform: `translateY(320px) scale(${emojiScale})`,
            opacity: emojiOpacity,
          }}
        >
          🎉
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
