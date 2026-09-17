"use client";

import Image from "next/image";
import { CirclePlay } from "lucide-react";
import { useState } from "react";

import { getYouTubeId } from "@/lib/helpers/getYouTubeId";

const InlineVideoPlayer = ({
  url,
  playLabel,
}: {
  url: string;
  playLabel: string;
}) => {
  const [playing, setPlaying] = useState(false);
  const videoId = getYouTubeId(url);

  return (
    <div className="relative mt-10 min-h-60 w-full overflow-hidden rounded-xl bg-black [aspect-ratio:1299/477] sm:min-h-0">
      {playing && videoId ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
          title={playLabel}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <>
          <Image
            src="/assets/images/video-bg.svg"
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/30" />
          <button
            type="button"
            onClick={() => setPlaying(true)}
            disabled={!videoId}
            className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center gap-2 whitespace-nowrap border border-white bg-black/20 px-7 py-4 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/45 disabled:cursor-not-allowed"
          >
            <CirclePlay size={18} /> {playLabel}
          </button>
        </>
      )}
    </div>
  );
};

export default InlineVideoPlayer;
