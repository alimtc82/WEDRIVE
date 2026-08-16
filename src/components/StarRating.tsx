interface Props {
  value: number;
  onChange: (v: number) => void;
}

export default function StarRating({ value, onChange }: Props) {
  return (
    <div className="starRow" role="radiogroup" aria-label="التقييم">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`starBtn ${n <= value ? "on" : ""}`}
          onClick={() => onChange(n)}
          aria-label={`${n} نجوم`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
