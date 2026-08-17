/** 폰트 조합 해석. 템플릿이 meta.json에 검증된 조합만 선언하고, 사용자는 그중에서 고른다.
 *
 *  자유 선택을 두지 않는 이유: 각 템플릿의 제목 크기·행간이 특정 서체에 맞춰 조정돼 있다.
 *  명조용 크기에 손글씨를 끼우면 레이아웃이 깨진다. 색을 자유롭게 고르게 두면
 *  결국 슬롭 색이 나오는 것과 같은 문제다. (PLAN.md 3.2) */

/** 조합을 선언하지 않은 템플릿의 기본값 */
export const DEFAULT_FONT = { id: "sans", name: "Pretendard", title: "Pretendard, sans-serif", weight: 800, scale: 1 };

/** 템플릿이 제공하는 조합 목록. 항상 최소 하나를 돌려준다. */
export function fontOptions(template) {
  const list = Array.isArray(template?.fonts) ? template.fonts.filter((f) => f && f.id) : [];
  return list.length ? list : [DEFAULT_FONT];
}

/**
 * 고른 id를 그 템플릿의 조합으로 해석한다.
 * id는 템플릿 간에 공유된다(sans / myeongjo / hand). 그래서 설정에 하나만 저장해두고
 * 템플릿을 바꿔도 취향이 유지되며, 그 템플릿에 없는 조합이면 첫 번째로 떨어진다.
 */
export function resolveFont(template, id) {
  const list = fontOptions(template);
  return list.find((f) => f.id === id) || list[0];
}

/** 렌더러에 넘길 CSS 변수 */
export function fontVars(font) {
  const f = font || DEFAULT_FONT;
  return {
    "--title-font": f.title || DEFAULT_FONT.title,
    "--title-weight": String(f.weight ?? DEFAULT_FONT.weight),
    "--font-scale": String(f.scale ?? 1),
  };
}
