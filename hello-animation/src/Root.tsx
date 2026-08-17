import React from "react";
import { Composition } from "remotion";
import { HelloAnimation, TOTAL_DURATION_IN_FRAMES } from "./HelloAnimation";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="HelloAnimation"
        component={HelloAnimation}
        durationInFrames={TOTAL_DURATION_IN_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
