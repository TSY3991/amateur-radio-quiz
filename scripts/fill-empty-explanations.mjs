import fs from "node:fs/promises";

const DEFAULT_BANK_PATH = "data/amateurRadioLevel3.generated.json";
const AUTO_EXPLANATION_PREFIX = "官方答案為";

const CATEGORY_NOTES = {
  regulations: "法規題要抓主管機關、資格、呼號、頻率、許可及操作限制；正解是最符合題幹法規條件的選項。",
  communication_methods: "通訊方法題要抓通聯程序、頻率使用、設備操作與訊號處理；正解是最符合實務操作或題庫標準用語的選項。",
  radio_system_principles: "系統原理題要抓電學單位、元件功能、天線、調變、接收與傳輸原理；正解對應題幹中的技術概念。",
  safety_protection: "安全題要優先考慮斷電、接地、防觸電、電力線距離與射頻暴露；正解是較安全且符合規範的處置。",
  electromagnetic_compatibility: "電磁相容題要抓濾波、屏蔽、接地、扼流與接收機抗干擾能力；正解是能降低不必要耦合或失真的作法。",
  rf_interference_prevention: "干擾排除題要先判斷干擾來源，再用濾波、接地、屏蔽、測向或合法協調方式處理。"
};

const HINT_RULES = [
  {
    pattern: /干擾|妨害|雜訊|濾波|屏蔽|鐵氧體|扼流|諧波|寄生|TVI|RFI|EMI/,
    hint: "本題重點是干擾來源與抑制方式；常見作法包含濾波、屏蔽、接地、鐵氧體扼流與改善設備抗干擾能力。"
  },
  {
    pattern: /衛星|多普勒|Doppler|軌道|自旋|GPS/,
    hint: "本題重點是衛星通訊特性；衛星相對運動、旋轉或軌道位置會影響接收頻率與信號強弱。"
  },
  {
    pattern: /安全|觸電|斷電|電力線|保險絲|接地|雷擊|避雷|RF|暴露|功率密度/,
    hint: "本題重點是人身與設備安全；測量、施工或天線架設前，應先降低觸電、雷擊與射頻暴露風險。"
  },
  {
    pattern: /NCC|國家通訊傳播委員會|主管機關|法規|管理辦法|電信管理法/,
    hint: "本題重點是主管機關或法規名稱的辨識；不要把國際組織、其他部會或不同用途的管理規範混在一起。"
  },
  {
    pattern: /呼號|識別信號|BV|BM|BN/,
    hint: "本題重點是電臺識別與呼號規則；呼號或識別方式用來確認電臺身分與設置類型。"
  },
  {
    pattern: /頻率|波段|MHz|兆赫|百萬赫|kHz|千赫|偏移|頻寬|頻道/,
    hint: "本題重點是頻率、波段、偏移量或頻寬的對應；作答時要直接比對題幹數值與題庫標準答案。"
  },
  {
    pattern: /中繼|轉發|repeater|偏移|上行|下行/,
    hint: "本題重點是中繼電臺的收發頻率、偏移與協調；中繼操作通常要避免與其他使用者互相干擾。"
  },
  {
    pattern: /緊急|救災|生命|危險|遇險|求救|災害/,
    hint: "本題重點是緊急通訊優先原則；遇到生命、財產或災害相關狀況時，通訊目的與合法性判斷會不同。"
  },
  {
    pattern: /禁止|不得|不可以|不可|不應|違法|罰|吊銷|廢止|撤銷/,
    hint: "本題重點是限制或禁止事項；看到不得、不可、違規處分等字眼時，要選出最符合規範限制的項目。"
  },
  {
    pattern: /QSL|QSO|QTH|QRM|QRN|QRP|QRT|QSY|CQ|ITU|UTC|DX/,
    hint: "本題重點是業餘無線電常用縮語與通聯慣例；這類題目通常考固定用語的意思。"
  },
  {
    pattern: /電流|電壓|電阻|功率|瓦|安培|伏特|歐姆|焦耳|頻率|週期|赫|電容|電感/,
    hint: "本題重點是基本電學量與單位；先確認題幹問的是哪一個物理量，再對應正確單位或關係。"
  },
  {
    pattern: /歐姆定律|公式|計算|等於|倍|平方|分貝|dB|增益|損耗/,
    hint: "本題重點是公式或比例關係；注意單位、倍數、增益與損耗的方向，避免把增加與降低混淆。"
  },
  {
    pattern: /天線|偶極|垂直|八木|駐波|SWR|饋線|同軸|阻抗|接地/,
    hint: "本題重點是天線、饋線與阻抗匹配；正確匹配與良好接地能降低損耗、反射與干擾。"
  },
  {
    pattern: /AM|FM|SSB|CW|調變|調幅|調頻|單邊帶|數位|封包|RTTY|PSK/,
    hint: "本題重點是調變方式或發射模式的特性；不同模式在頻寬、語音、資料或摩斯通訊上的用途不同。"
  },
  {
    pattern: /接收|發射|收發機|麥克風|PTT|靜噪|濾波器|靈敏度|選擇性/,
    hint: "本題重點是收發機操作與接收性能；要分清楚發射控制、接收濾波、靜噪與抗干擾能力。"
  },
  {
    pattern: /電池|電源|充電|極性|直流|交流|整流|變壓器/,
    hint: "本題重點是電源與供電安全；要注意極性、電壓型態、電池狀態與設備可承受的供電條件。"
  }
];

function optionText(question, key = question.answer) {
  return question.options.find((option) => option.key === key)?.text || key;
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function getQuestionHint(question, answerText) {
  const target = `${question.question} ${answerText}`;
  const isNegativeQuestion = /何者不|何者不是|何者非|不屬於|不正確|錯誤|不得|不可|不可以|禁止|除外/.test(question.question);

  if (/以上皆是/.test(answerText)) {
    return "題目中的多個敘述都符合題意，所以答案為以上皆是；作答時不要只檢查其中一個選項。";
  }

  if (/以上皆非/.test(answerText)) {
    return "題目中的其他選項都不符合題意，所以答案為以上皆非；作答時要逐一排除不符合條件的敘述。";
  }

  if (isNegativeQuestion) {
    return "題幹是在找不符合、錯誤或禁止的項目；作答時要先注意反向關鍵字，再選出例外或不合規的選項。";
  }

  const matchedRule = HINT_RULES.find((rule) => rule.pattern.test(target));
  return matchedRule?.hint || CATEGORY_NOTES[question.categoryKey] || "本題重點是題幹概念與正解選項的對應；可用官方答案作為複習基準。";
}

function buildExplanation(question) {
  const answerText = normalizeText(optionText(question));
  const hint = getQuestionHint(question, answerText);
  const categoryNote = CATEGORY_NOTES[question.categoryKey] || "";
  const note = categoryNote && !hint.includes(categoryNote) ? ` ${categoryNote}` : "";
  return normalizeText(`官方答案為（${question.answer}）${answerText}。${hint}${note}`);
}

async function main() {
  const args = process.argv.slice(2);
  const refreshAuto = args.includes("--refresh-auto");
  const bankPath = args.find((arg) => !arg.startsWith("--")) || DEFAULT_BANK_PATH;
  const raw = await fs.readFile(bankPath, "utf8");
  const bank = JSON.parse(raw);
  let changed = 0;

  for (const question of bank.questions || []) {
    const explanation = (question.explanation || "").trim();
    if (explanation && !(refreshAuto && explanation.startsWith(AUTO_EXPLANATION_PREFIX))) continue;
    question.explanation = buildExplanation(question);
    question.analysisStatus = question.analysisStatus || "concept";
    changed += 1;
  }

  await fs.writeFile(bankPath, `${JSON.stringify(bank, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    path: bankPath,
    changed,
    total: bank.questions?.length || 0,
    filled: (bank.questions || []).filter((question) => (question.explanation || "").trim()).length
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
