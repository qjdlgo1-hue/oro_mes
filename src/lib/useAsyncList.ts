import { useCallback, useEffect, useState } from "react";
import { toast } from "./toast";
import { errMsg } from "./errmsg";

// 목록 로드 공통 훅 — 컴포넌트마다 반복되던 useEffect + list().then(set) + 실패 토스트 + loaded 플래그를 통합.
// 사용: const { data, loaded, reload } = useAsyncList(listBom, {} as BomMap, "BOM");
export function useAsyncList<T>(fetcher: () => Promise<T>, initial: T, what = "목록") {
  const [data, setData] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(() => {
    return fetcher().then(setData)
      .catch(e => toast.error(`${what} 불러오기 실패: ` + errMsg(e)))
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { data, setData, loaded, reload };
}
