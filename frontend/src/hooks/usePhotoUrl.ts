import { useEffect, useState } from "react";

export function usePhotoUrl(photo: File | null) {
  const [current, setCurrent] = useState<{ photo: File; url: string } | null>(null);
  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setCurrent({ photo, url });
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  return current?.photo === photo ? current.url : null;
}
