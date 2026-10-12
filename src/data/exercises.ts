import type { Exercise, ExerciseType } from "../domain/types";
import { IMPORTED_EXERCISES } from "./exercises.generated";

/**
 * 动作库种子。
 *
 * 命名与分类为本项目自建；MET（代谢当量）参考《Compendium of Physical
 * Activities》公开数值，用于运动消耗的粗略估算。
 *
 * 如需扩充到 800+ 动作，可导入公有领域的 free-exercise-db
 * （Unlicense，876 个动作，字段：name / primaryMuscles / equipment / level），
 * 映射到本文件的 Exercise 结构即可，见 docs/data-sources.md。
 */

type Row = [
  name: string,
  nameEn: string,
  muscle: string,
  equipment: string,
  level: Exercise["level"],
  type: ExerciseType,
  met: number,
  loadable: boolean,
];

const ROWS: Row[] = [
  // 胸
  ["杠铃卧推", "Barbell Bench Press", "胸", "杠铃", "intermediate", "strength", 5.0, true],
  ["哑铃卧推", "Dumbbell Bench Press", "胸", "哑铃", "beginner", "strength", 5.0, true],
  ["上斜哑铃卧推", "Incline Dumbbell Press", "胸", "哑铃", "intermediate", "strength", 5.0, true],
  ["下斜杠铃卧推", "Decline Bench Press", "胸", "杠铃", "intermediate", "strength", 5.0, true],
  ["俯卧撑", "Push-up", "胸", "自重", "beginner", "strength", 4.0, false],
  ["钻石俯卧撑", "Diamond Push-up", "胸", "自重", "intermediate", "strength", 4.5, false],
  ["双杠臂屈伸", "Dips", "胸", "自重", "intermediate", "strength", 5.0, false],
  ["器械夹胸", "Pec Deck Fly", "胸", "器械", "beginner", "strength", 4.5, true],
  ["绳索夹胸", "Cable Crossover", "胸", "绳索", "intermediate", "strength", 4.5, true],
  ["哑铃飞鸟", "Dumbbell Fly", "胸", "哑铃", "beginner", "strength", 4.5, true],
  ["器械推胸", "Machine Chest Press", "胸", "器械", "beginner", "strength", 4.5, true],

  // 背
  ["引体向上", "Pull-up", "背", "自重", "intermediate", "strength", 5.5, false],
  ["高位下拉", "Lat Pulldown", "背", "器械", "beginner", "strength", 4.5, true],
  ["杠铃划船", "Barbell Row", "背", "杠铃", "intermediate", "strength", 5.0, true],
  ["哑铃单臂划船", "One-arm Dumbbell Row", "背", "哑铃", "beginner", "strength", 5.0, true],
  ["坐姿绳索划船", "Seated Cable Row", "背", "绳索", "beginner", "strength", 4.5, true],
  ["T 杠划船", "T-bar Row", "背", "杠铃", "intermediate", "strength", 5.0, true],
  ["硬拉", "Deadlift", "背", "杠铃", "expert", "strength", 6.0, true],
  ["罗马尼亚硬拉", "Romanian Deadlift", "背", "杠铃", "intermediate", "strength", 5.5, true],
  ["直臂下压", "Straight-arm Pulldown", "背", "绳索", "intermediate", "strength", 4.0, true],
  ["反向飞鸟", "Reverse Fly", "背", "哑铃", "beginner", "strength", 4.0, true],
  ["面拉", "Face Pull", "背", "绳索", "beginner", "strength", 4.0, true],
  ["山羊挺身", "Back Extension", "背", "自重", "beginner", "strength", 4.0, false],
  ["TRX 划船", "TRX Row", "背", "悬吊", "intermediate", "strength", 5.0, false],

  // 腿
  ["杠铃深蹲", "Barbell Back Squat", "腿", "杠铃", "intermediate", "strength", 6.0, true],
  ["前蹲", "Front Squat", "腿", "杠铃", "expert", "strength", 6.0, true],
  ["高脚杯深蹲", "Goblet Squat", "腿", "哑铃", "beginner", "strength", 5.5, true],
  ["腿举", "Leg Press", "腿", "器械", "beginner", "strength", 5.0, true],
  ["保加利亚分腿蹲", "Bulgarian Split Squat", "腿", "哑铃", "intermediate", "strength", 6.0, true],
  ["箭步蹲", "Walking Lunge", "腿", "哑铃", "beginner", "strength", 5.5, true],
  ["腿屈伸", "Leg Extension", "腿", "器械", "beginner", "strength", 4.0, true],
  ["腿弯举", "Leg Curl", "腿", "器械", "beginner", "strength", 4.0, true],
  ["坐姿提踵", "Seated Calf Raise", "腿", "器械", "beginner", "strength", 3.5, true],
  ["站姿提踵", "Standing Calf Raise", "腿", "自重", "beginner", "strength", 3.5, false],
  ["臀桥", "Glute Bridge", "腿", "自重", "beginner", "strength", 4.0, false],
  ["杠铃臀冲", "Barbell Hip Thrust", "腿", "杠铃", "intermediate", "strength", 5.0, true],
  ["相扑硬拉", "Sumo Deadlift", "腿", "杠铃", "expert", "strength", 6.0, true],
  ["哈克深蹲", "Hack Squat", "腿", "器械", "intermediate", "strength", 5.5, true],
  ["靠墙静蹲", "Wall Sit", "腿", "自重", "beginner", "strength", 3.0, false],

  // 肩
  ["杠铃推举", "Overhead Press", "肩", "杠铃", "intermediate", "strength", 5.0, true],
  ["哑铃肩推", "Dumbbell Shoulder Press", "肩", "哑铃", "beginner", "strength", 5.0, true],
  ["阿诺德推举", "Arnold Press", "肩", "哑铃", "intermediate", "strength", 5.0, true],
  ["哑铃侧平举", "Lateral Raise", "肩", "哑铃", "beginner", "strength", 3.5, true],
  ["绳索侧平举", "Cable Lateral Raise", "肩", "绳索", "intermediate", "strength", 3.5, true],
  ["前平举", "Front Raise", "肩", "哑铃", "beginner", "strength", 3.5, true],
  ["反向蝴蝶机", "Reverse Pec Deck", "肩", "器械", "beginner", "strength", 3.5, true],
  ["直立划船", "Upright Row", "肩", "杠铃", "intermediate", "strength", 4.0, true],
  ["倒立撑", "Handstand Push-up", "肩", "自重", "expert", "strength", 6.0, false],

  // 手臂
  ["杠铃弯举", "Barbell Curl", "手臂", "杠铃", "beginner", "strength", 3.5, true],
  ["哑铃交替弯举", "Alternating Dumbbell Curl", "手臂", "哑铃", "beginner", "strength", 3.5, true],
  ["锤式弯举", "Hammer Curl", "手臂", "哑铃", "beginner", "strength", 3.5, true],
  ["牧师凳弯举", "Preacher Curl", "手臂", "器械", "intermediate", "strength", 3.5, true],
  ["绳索下压", "Triceps Pushdown", "手臂", "绳索", "beginner", "strength", 3.5, true],
  ["仰卧臂屈伸", "Skull Crusher", "手臂", "杠铃", "intermediate", "strength", 4.0, true],
  ["窄距卧推", "Close-grip Bench Press", "手臂", "杠铃", "intermediate", "strength", 5.0, true],
  ["过顶臂屈伸", "Overhead Triceps Extension", "手臂", "哑铃", "beginner", "strength", 3.5, true],
  ["腕弯举", "Wrist Curl", "手臂", "哑铃", "beginner", "strength", 2.5, true],

  // 核心
  ["平板支撑", "Plank", "核心", "自重", "beginner", "strength", 3.5, false],
  ["侧平板支撑", "Side Plank", "核心", "自重", "beginner", "strength", 3.5, false],
  ["卷腹", "Crunch", "核心", "自重", "beginner", "strength", 3.5, false],
  ["悬垂举腿", "Hanging Leg Raise", "核心", "自重", "intermediate", "strength", 4.5, false],
  ["俄罗斯转体", "Russian Twist", "核心", "自重", "beginner", "strength", 4.0, false],
  ["死虫式", "Dead Bug", "核心", "自重", "beginner", "strength", 3.0, false],
  ["鸟狗式", "Bird Dog", "核心", "自重", "beginner", "strength", 3.0, false],
  ["健腹轮", "Ab Wheel Rollout", "核心", "器械", "intermediate", "strength", 4.5, false],
  ["登山跑", "Mountain Climber", "核心", "自重", "beginner", "cardio", 8.0, false],
  ["壶铃摆荡", "Kettlebell Swing", "核心", "壶铃", "intermediate", "strength", 9.8, true],

  // 有氧
  ["跑步（8 km/h）", "Running 8 km/h", "有氧", "自重", "beginner", "cardio", 8.3, false],
  ["跑步（10 km/h）", "Running 10 km/h", "有氧", "自重", "intermediate", "cardio", 9.8, false],
  ["跑步（12 km/h）", "Running 12 km/h", "有氧", "自重", "intermediate", "cardio", 11.5, false],
  ["快走（6 km/h）", "Brisk Walking", "有氧", "自重", "beginner", "cardio", 5.0, false],
  ["骑行（中速）", "Cycling Moderate", "有氧", "单车", "beginner", "cardio", 7.5, false],
  ["骑行（高强度）", "Cycling Vigorous", "有氧", "单车", "intermediate", "cardio", 10.0, false],
  ["动感单车", "Spinning", "有氧", "单车", "intermediate", "cardio", 8.5, false],
  ["划船机", "Rowing Machine", "有氧", "划船机", "intermediate", "cardio", 7.0, false],
  ["椭圆机", "Elliptical", "有氧", "器械", "beginner", "cardio", 5.0, false],
  ["跳绳", "Jump Rope", "有氧", "跳绳", "beginner", "cardio", 11.0, false],
  ["游泳（自由泳）", "Swimming Freestyle", "有氧", "泳池", "intermediate", "cardio", 8.3, false],
  ["游泳（蛙泳）", "Swimming Breaststroke", "有氧", "泳池", "beginner", "cardio", 7.0, false],
  ["爬楼梯", "Stair Climbing", "有氧", "自重", "beginner", "cardio", 8.8, false],
  ["HIIT（20 分钟）", "HIIT 20min", "有氧", "自重", "intermediate", "cardio", 10.0, false],
  ["搏击操", "Kickboxing", "有氧", "自重", "intermediate", "cardio", 10.3, false],
  ["篮球", "Basketball", "有氧", "场地", "intermediate", "cardio", 8.0, false],
  ["羽毛球", "Badminton", "有氧", "场地", "beginner", "cardio", 7.0, false],
  ["足球", "Football", "有氧", "场地", "intermediate", "cardio", 10.0, false],
  ["网球", "Tennis", "有氧", "场地", "intermediate", "cardio", 7.3, false],
  ["乒乓球", "Table Tennis", "有氧", "场地", "beginner", "cardio", 4.0, false],
  ["爬山", "Hiking", "有氧", "户外", "beginner", "cardio", 6.5, false],
  ["滑雪", "Skiing", "有氧", "户外", "intermediate", "cardio", 7.0, false],
  ["轮滑", "Rollerblading", "有氧", "户外", "beginner", "cardio", 7.5, false],

  // 柔韧 / 恢复
  ["静态拉伸", "Static Stretching", "柔韧", "自重", "beginner", "mobility", 2.3, false],
  ["动态热身", "Dynamic Warm-up", "柔韧", "自重", "beginner", "mobility", 3.0, false],
  ["泡沫轴放松", "Foam Rolling", "柔韧", "泡沫轴", "beginner", "mobility", 2.0, false],
  ["瑜伽（哈他）", "Hatha Yoga", "柔韧", "自重", "beginner", "mobility", 2.5, false],
  ["瑜伽（流瑜伽）", "Vinyasa Yoga", "柔韧", "自重", "intermediate", "mobility", 4.0, false],
  ["普拉提", "Pilates", "柔韧", "自重", "beginner", "mobility", 3.0, false],
  ["八段锦", "Baduanjin", "柔韧", "自重", "beginner", "mobility", 2.5, false],
  ["太极", "Tai Chi", "柔韧", "自重", "beginner", "mobility", 2.5, false],
];

const CURATED: Exercise[] = ROWS.map(
  ([name, nameEn, muscle, equipment, level, type, met, loadable]) => ({
    id: `ex:${nameEn}`,
    name,
    nameEn,
    muscle,
    equipment,
    level,
    type,
    met,
    loadable,
  }),
);

/** 按英文名去重：手工整理的中文名优先，其余来自 free-exercise-db */
const curatedNames = new Set(CURATED.map((e) => e.nameEn.toLowerCase()));
const imported = IMPORTED_EXERCISES.filter((e) => !curatedNames.has(e.nameEn.toLowerCase()));

export const SEED_EXERCISES: Exercise[] = [...CURATED, ...imported];

export const MUSCLES = ["全部", ...Array.from(new Set(SEED_EXERCISES.map((e) => e.muscle)))];
export const EQUIPMENTS = ["全部", ...Array.from(new Set(SEED_EXERCISES.map((e) => e.equipment)))];
export const LEVEL_LABEL: Record<Exercise["level"], string> = {
  beginner: "入门",
  intermediate: "进阶",
  expert: "高阶",
};

/** 内置训练计划模板：由动作库组合而成，用户可自由改名与增删 */
export interface PlanTemplate {
  id: string;
  name: string;
  tag: string;
  daysPerWeek: number;
  summary: string;
  days: { title: string; exercises: { nameEn: string; sets: number; reps: string }[] }[];
}

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: "plan:full-body-3",
    name: "全身三分化",
    tag: "新手友好",
    daysPerWeek: 3,
    summary: "每周 3 次全身训练，每个肌群每周刺激 3 次，进步快、容错高。",
    days: [
      {
        title: "全身 A",
        exercises: [
          { nameEn: "Barbell Back Squat", sets: 3, reps: "5-8" },
          { nameEn: "Barbell Bench Press", sets: 3, reps: "5-8" },
          { nameEn: "Barbell Row", sets: 3, reps: "6-10" },
          { nameEn: "Plank", sets: 3, reps: "40s" },
        ],
      },
      {
        title: "全身 B",
        exercises: [
          { nameEn: "Romanian Deadlift", sets: 3, reps: "6-10" },
          { nameEn: "Overhead Press", sets: 3, reps: "6-10" },
          { nameEn: "Lat Pulldown", sets: 3, reps: "8-12" },
          { nameEn: "Hanging Leg Raise", sets: 3, reps: "8-12" },
        ],
      },
      {
        title: "全身 C",
        exercises: [
          { nameEn: "Leg Press", sets: 3, reps: "10-15" },
          { nameEn: "Dumbbell Bench Press", sets: 3, reps: "8-12" },
          { nameEn: "Seated Cable Row", sets: 3, reps: "10-15" },
          { nameEn: "Kettlebell Swing", sets: 4, reps: "15" },
        ],
      },
    ],
  },
  {
    id: "plan:upper-lower-4",
    name: "上下肢四分化",
    tag: "增肌效率",
    daysPerWeek: 4,
    summary: "上肢 / 下肢交替，每周各两次。容量适中，适合有一定基础的训练者。",
    days: [
      {
        title: "上肢 A",
        exercises: [
          { nameEn: "Barbell Bench Press", sets: 4, reps: "5-8" },
          { nameEn: "Barbell Row", sets: 4, reps: "6-10" },
          { nameEn: "Overhead Press", sets: 3, reps: "8-10" },
          { nameEn: "Lat Pulldown", sets: 3, reps: "10-12" },
          { nameEn: "Barbell Curl", sets: 3, reps: "10-12" },
        ],
      },
      {
        title: "下肢 A",
        exercises: [
          { nameEn: "Barbell Back Squat", sets: 4, reps: "5-8" },
          { nameEn: "Romanian Deadlift", sets: 3, reps: "8-10" },
          { nameEn: "Leg Curl", sets: 3, reps: "10-15" },
          { nameEn: "Standing Calf Raise", sets: 4, reps: "12-20" },
          { nameEn: "Plank", sets: 3, reps: "45s" },
        ],
      },
      {
        title: "上肢 B",
        exercises: [
          { nameEn: "Pull-up", sets: 4, reps: "力竭-2" },
          { nameEn: "Incline Dumbbell Press", sets: 4, reps: "8-12" },
          { nameEn: "Seated Cable Row", sets: 3, reps: "10-12" },
          { nameEn: "Lateral Raise", sets: 4, reps: "12-15" },
          { nameEn: "Triceps Pushdown", sets: 3, reps: "12-15" },
        ],
      },
      {
        title: "下肢 B",
        exercises: [
          { nameEn: "Deadlift", sets: 3, reps: "3-5" },
          { nameEn: "Bulgarian Split Squat", sets: 3, reps: "8-12" },
          { nameEn: "Leg Extension", sets: 3, reps: "12-15" },
          { nameEn: "Seated Calf Raise", sets: 4, reps: "15-20" },
          { nameEn: "Hanging Leg Raise", sets: 3, reps: "10-15" },
        ],
      },
    ],
  },
  {
    id: "plan:ppl-6",
    name: "推拉腿六分化",
    tag: "进阶容量",
    daysPerWeek: 6,
    summary: "推 / 拉 / 腿各两次，容量大。需要较好的恢复与饮食支撑。",
    days: [
      {
        title: "推 A",
        exercises: [
          { nameEn: "Barbell Bench Press", sets: 4, reps: "5-8" },
          { nameEn: "Overhead Press", sets: 3, reps: "6-10" },
          { nameEn: "Incline Dumbbell Press", sets: 3, reps: "8-12" },
          { nameEn: "Lateral Raise", sets: 4, reps: "12-15" },
          { nameEn: "Triceps Pushdown", sets: 3, reps: "12-15" },
        ],
      },
      {
        title: "拉 A",
        exercises: [
          { nameEn: "Deadlift", sets: 3, reps: "3-5" },
          { nameEn: "Pull-up", sets: 4, reps: "6-10" },
          { nameEn: "Seated Cable Row", sets: 3, reps: "10-12" },
          { nameEn: "Face Pull", sets: 3, reps: "15-20" },
          { nameEn: "Barbell Curl", sets: 3, reps: "10-12" },
        ],
      },
      {
        title: "腿 A",
        exercises: [
          { nameEn: "Barbell Back Squat", sets: 4, reps: "5-8" },
          { nameEn: "Leg Press", sets: 3, reps: "10-12" },
          { nameEn: "Leg Curl", sets: 3, reps: "10-15" },
          { nameEn: "Standing Calf Raise", sets: 4, reps: "12-20" },
        ],
      },
      {
        title: "推 B",
        exercises: [
          { nameEn: "Overhead Press", sets: 4, reps: "5-8" },
          { nameEn: "Dumbbell Bench Press", sets: 4, reps: "8-12" },
          { nameEn: "Cable Crossover", sets: 3, reps: "12-15" },
          { nameEn: "Cable Lateral Raise", sets: 4, reps: "15-20" },
          { nameEn: "Skull Crusher", sets: 3, reps: "10-12" },
        ],
      },
      {
        title: "拉 B",
        exercises: [
          { nameEn: "Barbell Row", sets: 4, reps: "6-10" },
          { nameEn: "Lat Pulldown", sets: 4, reps: "10-12" },
          { nameEn: "Reverse Fly", sets: 3, reps: "12-15" },
          { nameEn: "Hammer Curl", sets: 3, reps: "10-12" },
        ],
      },
      {
        title: "腿 B",
        exercises: [
          { nameEn: "Romanian Deadlift", sets: 4, reps: "8-10" },
          { nameEn: "Bulgarian Split Squat", sets: 3, reps: "8-12" },
          { nameEn: "Leg Extension", sets: 3, reps: "12-15" },
          { nameEn: "Seated Calf Raise", sets: 4, reps: "15-20" },
          { nameEn: "Ab Wheel Rollout", sets: 3, reps: "8-12" },
        ],
      },
    ],
  },
  {
    id: "plan:fatloss-4",
    name: "减脂四合一",
    tag: "减脂",
    daysPerWeek: 4,
    summary: "力量 + 有氧组合，保留肌肉的同时提高消耗。配合热量缺口使用。",
    days: [
      {
        title: "力量 A",
        exercises: [
          { nameEn: "Barbell Back Squat", sets: 3, reps: "6-8" },
          { nameEn: "Dumbbell Bench Press", sets: 3, reps: "8-10" },
          { nameEn: "Barbell Row", sets: 3, reps: "8-10" },
          { nameEn: "Plank", sets: 3, reps: "45s" },
        ],
      },
      {
        title: "有氧 + 核心",
        exercises: [
          { nameEn: "HIIT 20min", sets: 1, reps: "20min" },
          { nameEn: "Mountain Climber", sets: 4, reps: "30s" },
          { nameEn: "Russian Twist", sets: 3, reps: "20" },
          { nameEn: "Foam Rolling", sets: 1, reps: "10min" },
        ],
      },
      {
        title: "力量 B",
        exercises: [
          { nameEn: "Romanian Deadlift", sets: 3, reps: "8-10" },
          { nameEn: "Overhead Press", sets: 3, reps: "8-10" },
          { nameEn: "Lat Pulldown", sets: 3, reps: "10-12" },
          { nameEn: "Hanging Leg Raise", sets: 3, reps: "10-12" },
        ],
      },
      {
        title: "有氧长距离",
        exercises: [
          { nameEn: "Running 8 km/h", sets: 1, reps: "40min" },
          { nameEn: "Static Stretching", sets: 1, reps: "10min" },
        ],
      },
    ],
  },
];
