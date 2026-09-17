import RatingStar from "@/components/atoms/RatingStar/RatingStar";

const ReviewStars = ({
  rating,
  size = 16,
  showValue = false,
}: {
  rating: number;
  size?: number;
  showValue?: boolean;
}) => {
  const rounded = Math.round(rating);

  return (
    <div className="flex items-center gap-1" aria-label={`${rating} out of 5 stars`}>
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, index) => (
          <RatingStar
            key={index}
            size={size}
            filled={index < rounded}
            className={index < rounded ? "text-[#FDD037]" : "text-border"}
          />
        ))}
      </div>
      {showValue && (
        <span className="text-sm font-semibold text-foreground">{rating.toFixed(1)}</span>
      )}
    </div>
  );
};

export default ReviewStars;
