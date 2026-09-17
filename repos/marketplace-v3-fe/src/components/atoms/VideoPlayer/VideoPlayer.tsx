import { getYouTubeId } from "@/lib/helpers/getYouTubeId";

const VideoPlayer = ({ url }: { url: string }) => {
  const videoId = getYouTubeId(url);

  if (!videoId) return null;

  return (
    <div className="flex-1 w-full min-w-75 max-h-101 lg:h-101 md:h-75 min-h-57.5 bg-black/60">
      <iframe
        className="w-full h-full"
        src={`https://www.youtube.com/embed/${videoId}`}
        title="YouTube video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
};

export default VideoPlayer;
