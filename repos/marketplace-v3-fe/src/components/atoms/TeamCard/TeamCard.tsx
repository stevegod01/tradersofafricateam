import Image from "next/image";

const TeamCard = ({
  name,
  url,
  imgUrl,
  role,
}: {
  name: string;
  url: string;
  imgUrl: string;
  role: string;
}) => {
  return (
    <div className="space-y-2">
      <div className="bg-muted/40 w-37.5 min-w-37.5 h-42.5 max-h-42.5 overflow-hidden relative">
        <Image
          src={imgUrl}
          width={150}
          height={170}
          alt={`profile pic of ${name}`}
          className="w-full h-full object-cover relative"
        />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute w-8 h-8 bg-blue-800 overflow-hidden bottom-0 right-0"
        >
          <Image
            src="/assets/icons/linkedin.svg"
            width={32}
            height={32}
            alt="linkedIn Icon"
            className="object-contain hover:scale-110 transition-all duration-300 ease-out"
          />
        </a>
      </div>
      <div className="">
        <p className="font-bold">{name}</p>
        <p className="font-light text-xs">{role}</p>
      </div>
    </div>
  );
};

export default TeamCard;
