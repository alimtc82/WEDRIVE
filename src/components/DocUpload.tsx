import { useRef, useState } from "react";

interface Props {
  label: string;
  file: File | null;
  onPick: (file: File) => void;
}

export default function DocUpload({ label, file, onPick }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handle = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return;
    onPick(f);
    setPreview(URL.createObjectURL(f));
  };

  return (
    <div className="docUpload" onClick={() => inputRef.current?.click()}>
      <input ref={inputRef} type="file" accept="image/*" hidden
        onChange={(e) => handle(e.target.files?.[0])} />
      {preview || file ? (
        <div className="docPreview">
          <img src={preview || ""} alt="" />
          <span className="docChange">تغيير</span>
        </div>
      ) : (
        <div className="docEmpty">
          <span className="docPlus">+</span>
          <span>{label}</span>
        </div>
      )}
    </div>
  );
}
