const AuthLabel = ({
  htmlFor,
  children,
  optional,
}: {
  htmlFor: string;
  children: React.ReactNode;
  optional?: boolean;
}) => {
  return (
    <label
      htmlFor={htmlFor}
      className="flex items-center gap-1.5 text-sm font-semibold text-foreground"
    >
      {children}
      {optional && (
        <span className="text-xs font-normal text-muted-foreground">
          (optional)
        </span>
      )}
    </label>
  );
};

export default AuthLabel;
