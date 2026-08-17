/** 이미지 배분: 추출본을 먼저 붙이고 모자란 만큼만 생성한다. PLAN.md 4.4
 *
 *  electron에 의존하지 않는다 — main.js 안에 있으면 테스트할 수 없어서 떼어냈다.
 *  generate는 (hint) => Promise<Buffer> 형태의 함수를 주입받는다. */

/** 이미지를 받을 카드. 표지와 서술 카드만 — 목록·인용·수치·대비는 글이 주인공이다 */
export const wantsImage = (card) => card.layout === "cover" || card.layout === "statement";

export async function attachImages(cards, pool, cfg, { generate, log = () => {} } = {}) {
  const targets = cards.filter(wantsImage);
  if (!targets.length) return { assigned: 0, generated: 0 };

  const spare = [...pool];
  for (const card of targets) {
    if (!spare.length) break;
    card.image = spare.shift();
  }
  const assigned = targets.filter((c) => c.image).length;
  log(`이미지: 자료에서 ${assigned}장 배정 (추출 ${pool.length}장)`);

  const missing = targets.filter((c) => !c.image);
  if (!missing.length) return { assigned, generated: 0 };
  if (!cfg.generateImages || !generate) {
    log(`${missing.length}장은 이미지 없이 갑니다 (생성 꺼짐)`);
    return { assigned, generated: 0 };
  }

  const todo = missing.slice(0, Math.max(0, Number(cfg.maxGenerate) || 0));
  if (!todo.length) return { assigned, generated: 0 };
  log(`부족분 ${todo.length}장 생성합니다 (상한 ${cfg.maxGenerate}장)`);

  let generated = 0;
  for (const [i, card] of todo.entries()) {
    const hint = card.image_hint || "soft blurred texture, muted tones, empty space";
    log(`  생성 ${i + 1}/${todo.length}: ${hint.slice(0, 50)}…`);
    try {
      card.image = { ext: "png", data: await generate(hint) };
      generated++;
    } catch (e) {
      log(`  생성 실패: ${e.message}`);
      break;                       // 첫 실패에서 멈춘다. 과금·시간 낭비 방지
    }
  }
  return { assigned, generated };
}
