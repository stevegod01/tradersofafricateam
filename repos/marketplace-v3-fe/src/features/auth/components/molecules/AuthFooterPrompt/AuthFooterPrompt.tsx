import Link from "next/link";

const AuthFooterPrompt = ({
  text,
  actionText,
  href,
}: {
  text: string;
  actionText: string;
  href: string;
}) => {
  return (
    <p className="text-center text-sm text-muted-foreground">
      {text}{" "}
      <Link
        href={href}
        className="font-semibold text-(--orange) transition-colors hover:text-(--orange-dark) hover:underline"
      >
        {actionText}
      </Link>
    </p>
  );
};

export default AuthFooterPrompt;
