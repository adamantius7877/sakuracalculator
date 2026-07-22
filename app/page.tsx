"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  ActivityKey,
  DashboardState,
  Food,
  LogEntry,
  Profile,
  Sex,
  UserProfile,
} from "@/lib/types";

type FdcFood = {
  fdcId: number;
  description: string;
  brandOwner?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients?: { nutrientName: string; value: number; unitName: string }[];
};

const STORAGE_KEY = "calorie-dashboard-v1";
const CALORIES_PER_POUND = 3500;
const MIN_RECOMMENDED_CALORIES: Record<Sex, number> = {
  male: 1500,
  female: 1200,
  transFemale: 1200,
  transMale: 1500,
};

const sexOptions: Record<Sex, string> = {
  male: "Cis male",
  female: "Cis female",
  transFemale: "Trans woman",
  transMale: "Trans man",
};

const activityLevels: Record<ActivityKey, { label: string; factor: number }> = {
  sedentary: { label: "Sedentary", factor: 1.2 },
  light: { label: "Light", factor: 1.375 },
  moderate: { label: "Moderate", factor: 1.55 },
  active: { label: "Active", factor: 1.725 },
  "very-active": { label: "Very active", factor: 1.9 },
};

const defaultProfile: Profile = {
  sex: "male",
  age: 35,
  heightIn: 70,
  weightLb: 220,
  bodyFat: 0,
  hrtYears: 0,
  activity: "light",
  goalWeightLb: 195,
  goalWeeks: 24,
  plannedDailyCalories: 1800,
};

function createUserProfile(name = "Me", profile: Profile = defaultProfile): UserProfile {
  return {
    id: uid("p"),
    name,
    profile: { ...defaultProfile, ...profile },
  };
}

function buildDefaultState(): DashboardState {
  const firstProfile = createUserProfile("Me");
  return {
    profiles: [firstProfile],
    activeProfileId: firstProfile.id,
    foods: starterFoods,
    log: [],
  };
}

function normalizeDashboardState(saved: Partial<DashboardState> & { profile?: Profile }): DashboardState {
  const fallback = buildDefaultState();
  const profiles = saved.profiles?.length
    ? saved.profiles.map((item) => ({
        id: item.id || uid("p"),
        name: item.name || "Profile",
        profile: { ...defaultProfile, ...item.profile },
      }))
    : [createUserProfile("Me", { ...defaultProfile, ...saved.profile })];
  const activeProfileId = profiles.some((item) => item.id === saved.activeProfileId)
    ? saved.activeProfileId ?? profiles[0].id
    : profiles[0].id;
  const log = (saved.log ?? []).map((entry) => ({
    ...entry,
    profileId: entry.profileId || activeProfileId,
  }));

  return {
    profiles,
    activeProfileId,
    foods: saved.foods?.length ? saved.foods : fallback.foods,
    log,
  };
}

const starterFoods: Food[] = [
  {
    id: "f-chicken-rice",
    name: "Chicken breast and rice bowl",
    source: "Example",
    serving: "1 bowl",
    calories: 520,
    protein: 48,
    carbs: 52,
    fat: 12,
  },
  {
    id: "f-greek-yogurt",
    name: "Greek yogurt with berries",
    source: "Example",
    serving: "1 cup",
    calories: 210,
    protein: 22,
    carbs: 24,
    fat: 2,
  },
  {
    id: "f-restaurant-burger",
    name: "Restaurant cheeseburger",
    source: "Example",
    serving: "1 sandwich",
    calories: 780,
    protein: 39,
    carbs: 48,
    fat: 46,
  },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(startIso: string, days: number) {
  const date = new Date(`${startIso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatProjectionDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${iso}T12:00:00`));
}

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function round(value: number) {
  return Math.round(Number.isFinite(value) ? value : 0);
}

function lbToKg(lb: number) {
  return lb * 0.45359237;
}

function inchToCm(inches: number) {
  return inches * 2.54;
}

function estimateBmr(profile: Profile, weightLb = profile.weightLb) {
  const kg = lbToKg(weightLb);
  const cm = inchToCm(profile.heightIn);

  if (profile.bodyFat > 0 && profile.bodyFat < 65) {
    const leanMassKg = kg * (1 - profile.bodyFat / 100);
    return 370 + 21.6 * leanMassKg;
  }

  const sexOffset = mifflinSexOffset(profile);
  return 10 * kg + 6.25 * cm - 5 * profile.age + sexOffset;
}

function mifflinSexOffset(profile: Profile) {
  const maleOffset = 5;
  const femaleOffset = -161;

  if (profile.sex === "male") return maleOffset;
  if (profile.sex === "female") return femaleOffset;

  const transitionProgress = Math.min(Math.max(profile.hrtYears, 0), 5) / 5;
  if (profile.sex === "transFemale") {
    return maleOffset + (femaleOffset - maleOffset) * transitionProgress;
  }

  return femaleOffset + (maleOffset - femaleOffset) * transitionProgress;
}

function bmrMethodLabel(profile: Profile) {
  if (profile.bodyFat > 0 && profile.bodyFat < 65) {
    return "Katch-McArdle from lean mass";
  }

  if (profile.sex === "transFemale" || profile.sex === "transMale") {
    return "Trans-inclusive Mifflin-St Jeor estimate";
  }

  return "Mifflin-St Jeor";
}

function estimateTdee(profile: Profile, weightLb = profile.weightLb) {
  return estimateBmr(profile, weightLb) * activityLevels[profile.activity].factor;
}

function simulateWeight(profile: Profile, dailyCalories: number, days: number) {
  let weight = profile.weightLb;
  const points = [];

  for (let day = 0; day <= days; day += 1) {
    const tdee = estimateTdee(profile, weight);
    const deficit = tdee - dailyCalories;
    if (day % 7 === 0 || day === days) {
      points.push({
        day,
        week: day / 7,
        weight,
        maintenanceCalories: tdee,
        targetCalories: dailyCalories,
        deficit,
      });
    }
    weight -= deficit / CALORIES_PER_POUND;
  }

  return { finalWeight: weight, points };
}

function caloriesForGoal(profile: Profile) {
  const days = Math.max(7, Math.round(profile.goalWeeks * 7));
  const target = Math.max(80, profile.goalWeightLb);
  const minRecommended = MIN_RECOMMENDED_CALORIES[profile.sex];
  let low = 0;
  let high = Math.max(estimateTdee(profile) + 800, 1800);

  for (let i = 0; i < 42; i += 1) {
    const mid = (low + high) / 2;
    const result = simulateWeight(profile, mid, days);
    if (result.finalWeight > target) {
      high = mid;
    } else {
      low = mid;
    }
  }

  const requiredCalories = (low + high) / 2;
  const calories = Math.max(requiredCalories, minRecommended);
  const requiredLossLb = Math.max(0, profile.weightLb - target);
  const weeklyPace = requiredLossLb / (days / 7);
  const isBelowRecommended = requiredCalories < minRecommended;
  return {
    calories,
    requiredCalories,
    days,
    isBelowRecommended,
    minRecommended,
    target,
    weeklyPace,
    projection: simulateWeight(profile, calories, days),
    requiredProjection: simulateWeight(profile, requiredCalories, days),
  };
}

function caloriesForWeeklyLoss(profile: Profile, poundsPerWeek: number) {
  const weeks = 12;
  const targetProfile = {
    ...profile,
    goalWeightLb: Math.max(80, profile.weightLb - poundsPerWeek * weeks),
    goalWeeks: weeks,
  };
  return caloriesForGoal(targetProfile).calories;
}

function projectTimelineForCalories(profile: Profile, dailyCalories: number) {
  const target = Math.max(80, profile.goalWeightLb);
  const startingWeight = profile.weightLb;
  const maxDays = 3650;

  if (!Number.isFinite(dailyCalories) || dailyCalories <= 0) {
    return {
      canReachGoal: false,
      reason: "Enter daily calories to calculate a timeline.",
      days: 0,
      finalWeight: startingWeight,
      averageWeeklyLoss: 0,
    };
  }

  if (startingWeight <= target) {
    return {
      canReachGoal: true,
      reason: "Goal already reached.",
      days: 0,
      finalWeight: startingWeight,
      averageWeeklyLoss: 0,
    };
  }

  let weight = startingWeight;
  let previousWeight = weight;

  for (let day = 1; day <= maxDays; day += 1) {
    const tdee = estimateTdee(profile, weight);
    const deficit = tdee - dailyCalories;
    weight -= deficit / CALORIES_PER_POUND;

    if (weight <= target) {
      const lost = startingWeight - target;
      return {
        canReachGoal: true,
        reason: "",
        days: day,
        finalWeight: weight,
        averageWeeklyLoss: lost / (day / 7),
      };
    }

    if (day % 30 === 0) {
      const monthlyChange = previousWeight - weight;
      previousWeight = weight;
      if (monthlyChange < 0.05) {
        break;
      }
    }
  }

  return {
    canReachGoal: false,
    reason:
      "At this intake, the projection does not reach your goal within 10 years.",
    days: maxDays,
    finalWeight: weight,
    averageWeeklyLoss: Math.max(0, (startingWeight - weight) / (maxDays / 7)),
  };
}

function formatDuration(days: number) {
  const wholeWeeks = Math.floor(days / 7);
  const extraDays = days % 7;
  const weekLabel = wholeWeeks === 1 ? "week" : "weeks";
  const dayLabel = extraDays === 1 ? "day" : "days";
  return `${wholeWeeks} ${weekLabel}, ${extraDays} ${dayLabel}`;
}

function formatWeekDay(days: number) {
  if (days === 0) return "Today";
  const week = Math.floor(days / 7) + 1;
  const day = days % 7 || 7;
  return `Day ${day} of week ${week}`;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function foodsFromCsv(text: string) {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => header.toLowerCase());
  const indexOf = (...names: string[]) =>
    headers.findIndex((header) => names.some((name) => header.includes(name)));

  const nameIndex = indexOf("food", "item", "name", "restaurant");
  const caloriesIndex = indexOf("calorie", "kcal");
  const servingIndex = indexOf("serving", "portion", "size");
  const sourceIndex = indexOf("source", "restaurant", "brand");
  const proteinIndex = indexOf("protein");
  const carbsIndex = indexOf("carb");
  const fatIndex = indexOf("fat");

  if (nameIndex < 0 || caloriesIndex < 0) return [];

  return rows.slice(1).flatMap((row) => {
    const calories = Number(row[caloriesIndex]?.replace(/[^0-9.]/g, ""));
    const name = row[nameIndex];
    if (!name || !Number.isFinite(calories) || calories <= 0) return [];

    return [
      {
        id: uid("f"),
        name,
        source: row[sourceIndex] || "Imported sheet",
        serving: row[servingIndex] || "1 serving",
        calories,
        protein: Number(row[proteinIndex]) || undefined,
        carbs: Number(row[carbsIndex]) || undefined,
        fat: Number(row[fatIndex]) || undefined,
      },
    ];
  });
}

function nutrient(food: FdcFood, name: string) {
  return (
    food.foodNutrients?.find((entry) =>
      entry.nutrientName.toLowerCase().includes(name),
    )?.value ?? 0
  );
}

export default function Home() {
  const [profiles, setProfiles] = useState<UserProfile[]>(() => [
    createUserProfile("Me"),
  ]);
  const [activeProfileId, setActiveProfileId] = useState("");
  const [profileName, setProfileName] = useState("Me");
  const [foods, setFoods] = useState<Food[]>(starterFoods);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [selectedFoodId, setSelectedFoodId] = useState(starterFoods[0].id);
  const [quantity, setQuantity] = useState(1);
  const [entryDate, setEntryDate] = useState(todayIso());
  const [projectionStartDate] = useState(todayIso());
  const [newFood, setNewFood] = useState({
    name: "",
    source: "Manual",
    serving: "",
    calories: "",
  });
  const [csvText, setCsvText] = useState("");
  const [csvUrl, setCsvUrl] = useState("");
  const [fdcQuery, setFdcQuery] = useState("");
  const [fdcResults, setFdcResults] = useState<FdcFood[]>([]);
  const [status, setStatus] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    function applyState(nextState: DashboardState) {
      setProfiles(nextState.profiles);
      setActiveProfileId(nextState.activeProfileId);
      setProfileName(
        nextState.profiles.find((item) => item.id === nextState.activeProfileId)
          ?.name ?? nextState.profiles[0].name,
      );
      setFoods(nextState.foods);
      setLog(nextState.log);
    }

    async function loadState() {
      const raw = localStorage.getItem(STORAGE_KEY);
      const localState = raw
        ? normalizeDashboardState(JSON.parse(raw))
        : buildDefaultState();

      try {
        const response = await fetch("/api/state");
        if (response.ok) {
          const data = await response.json();
          if (data.configured && data.hasData && data.state) {
            if (!isCancelled) applyState(normalizeDashboardState(data.state));
            return;
          }

          if (data.configured && raw && !isCancelled) {
            setStatus("Loaded local data. It will sync to PostgreSQL.");
          }
        }
      } catch {
        if (!isCancelled) {
          setStatus("Database unavailable. Using browser storage.");
        }
      }

      if (!isCancelled) applyState(localState);
    }

    loadState()
      .catch(() => {
        if (!isCancelled) {
          applyState(buildDefaultState());
          setStatus("Saved dashboard data could not be loaded.");
        }
      })
      .finally(() => {
        if (!isCancelled) setIsHydrated(true);
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated || !activeProfileId) return;
    const state: DashboardState = {
      profiles,
      activeProfileId,
      foods,
      log,
    };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(state),
    );

    const saveTimer = window.setTimeout(() => {
      fetch("/api/state", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(state),
      }).catch(() => {
        // Browser storage remains the offline fallback when the API is unavailable.
      });
    }, 350);

    return () => window.clearTimeout(saveTimer);
  }, [activeProfileId, foods, isHydrated, log, profiles]);

  const activeUserProfile =
    profiles.find((item) => item.id === activeProfileId) ?? profiles[0];
  const profile = activeUserProfile.profile;
  const profileLog = log.filter((entry) => entry.profileId === activeUserProfile.id);

  const selectedFood = foods.find((food) => food.id === selectedFoodId) ?? foods[0];
  const todayTotal = log
    .filter(
      (entry) =>
        entry.date === entryDate && entry.profileId === activeUserProfile.id,
    )
    .reduce((sum, entry) => sum + entry.calories * entry.quantity, 0);

  const calculator = useMemo(() => {
    const bmr = estimateBmr(profile);
    const tdee = estimateTdee(profile);
    const goal = caloriesForGoal(profile);
    const plannedTimeline = projectTimelineForCalories(
      profile,
      profile.plannedDailyCalories,
    );
    return {
      bmr,
      tdee,
      maintain: tdee,
      loseHalf: caloriesForWeeklyLoss(profile, 0.5),
      loseOne: caloriesForWeeklyLoss(profile, 1),
      loseOneHalf: caloriesForWeeklyLoss(profile, 1.5),
      loseTwo: caloriesForWeeklyLoss(profile, 2),
      goal,
      plannedTimeline,
    };
  }, [profile]);

  const remainingToday = calculator.goal.calories - todayTotal;
  const projectedEndDate = addDaysIso(projectionStartDate, calculator.goal.days);
  const plannedEndDate = addDaysIso(
    projectionStartDate,
    calculator.plannedTimeline.days,
  );
  const goalMetricLabel = calculator.goal.isBelowRecommended
    ? "Goal floor"
    : "Goal pace";
  const maxPointWeight = Math.max(
    ...calculator.goal.projection.points.map((point) => point.weight),
  );
  const minPointWeight = Math.min(
    ...calculator.goal.projection.points.map((point) => point.weight),
  );

  function updateProfile<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfiles((current) =>
      current.map((item) =>
        item.id === activeUserProfile.id
          ? { ...item, profile: { ...item.profile, [key]: value } }
          : item,
      ),
    );
  }

  function switchProfile(profileId: string) {
    const nextProfile = profiles.find((item) => item.id === profileId);
    if (!nextProfile) return;
    setActiveProfileId(profileId);
    setProfileName(nextProfile.name);
    setStatus(`Switched to ${nextProfile.name}.`);
  }

  function createProfile() {
    const name = profileName.trim() || `Profile ${profiles.length + 1}`;
    const newProfile = createUserProfile(name, profile);
    setProfiles((current) => [...current, newProfile]);
    setActiveProfileId(newProfile.id);
    setProfileName(newProfile.name);
    setStatus(`${newProfile.name} was created.`);
  }

  function renameActiveProfile() {
    const name = profileName.trim();
    if (!name) return;
    setProfiles((current) =>
      current.map((item) =>
        item.id === activeUserProfile.id ? { ...item, name } : item,
      ),
    );
    setStatus(`Renamed profile to ${name}.`);
  }

  function deleteActiveProfile() {
    if (profiles.length <= 1) {
      setStatus("Keep at least one profile.");
      return;
    }

    const remainingProfiles = profiles.filter(
      (item) => item.id !== activeUserProfile.id,
    );
    const nextProfile = remainingProfiles[0];
    setProfiles(remainingProfiles);
    setLog((current) =>
      current.filter((entry) => entry.profileId !== activeUserProfile.id),
    );
    setActiveProfileId(nextProfile.id);
    setProfileName(nextProfile.name);
    setStatus(`${activeUserProfile.name} was removed.`);
  }

  function addManualFood(event: FormEvent) {
    event.preventDefault();
    const calories = Number(newFood.calories);
    if (!newFood.name || !newFood.serving || calories <= 0) return;

    const food: Food = {
      id: uid("f"),
      name: newFood.name,
      source: newFood.source || "Manual",
      serving: newFood.serving,
      calories,
    };

    setFoods((current) => [food, ...current]);
    setSelectedFoodId(food.id);
    setNewFood({ name: "", source: "Manual", serving: "", calories: "" });
    setStatus(`${food.name} was added to your food library.`);
  }

  function addLogEntry() {
    if (!selectedFood) return;
    setLog((current) => [
      {
        id: uid("l"),
        profileId: activeUserProfile.id,
        foodId: selectedFood.id,
        name: selectedFood.name,
        serving: selectedFood.serving,
        calories: selectedFood.calories,
        quantity,
        date: entryDate,
      },
      ...current,
    ]);
  }

  function importCsv(text: string) {
    const imported = foodsFromCsv(text);
    if (!imported.length) {
      setStatus("No foods found. Use columns like Food, Serving, Calories, Source.");
      return;
    }
    setFoods((current) => [...imported, ...current]);
    setStatus(`Imported ${imported.length} foods from your sheet.`);
  }

  async function importCsvUrl() {
    if (!csvUrl) return;
    setStatus("Fetching your published sheet CSV...");
    try {
      const response = await fetch(csvUrl);
      if (!response.ok) throw new Error("Fetch failed");
      importCsv(await response.text());
    } catch {
      setStatus("Could not fetch that CSV URL. A published Google Sheet CSV link works best.");
    }
  }

  async function searchFdc() {
    if (!fdcQuery) {
      setStatus("Enter a USDA FoodData Central search term first.");
      return;
    }

    setStatus("Searching USDA FoodData Central...");
    const url = new URL("/api/usda/search", window.location.origin);
    url.searchParams.set("query", fdcQuery);

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("USDA request failed");
      const data = await response.json();
      setFdcResults(data.foods ?? []);
      setStatus(`Found ${(data.foods ?? []).length} USDA matches.`);
    } catch {
      setStatus("USDA search failed. Check FDC_API_KEY and server internet access.");
    }
  }

  function importFdcFood(result: FdcFood) {
    const serving =
      result.servingSize && result.servingSizeUnit
        ? `${result.servingSize} ${result.servingSizeUnit}`
        : "100 g";
    const food: Food = {
      id: uid("f"),
      name: result.description.toLowerCase(),
      source: result.brandOwner ? `USDA FDC - ${result.brandOwner}` : "USDA FoodData Central",
      serving,
      calories: round(nutrient(result, "energy")),
      protein: nutrient(result, "protein") || undefined,
      carbs: nutrient(result, "carbohydrate") || undefined,
      fat: nutrient(result, "total lipid") || undefined,
    };

    setFoods((current) => [food, ...current]);
    setSelectedFoodId(food.id);
    setStatus(`${food.name} was imported from USDA FoodData Central.`);
  }

  return (
    <main className="min-h-screen bg-[#fff3f8] text-[#33212a]">
      <section className="hero-band border-b border-[#f0bdd0] bg-[#fff8fb]">
        <div className="fairy fairy-one" aria-hidden="true">
          <span className="fairy-wing fairy-wing-left" />
          <span className="fairy-wing fairy-wing-right" />
          <span className="fairy-body" />
          <span className="fairy-wand" />
        </div>
        <div className="fairy fairy-two" aria-hidden="true">
          <span className="fairy-wing fairy-wing-left" />
          <span className="fairy-wing fairy-wing-right" />
          <span className="fairy-body" />
          <span className="fairy-wand" />
        </div>
        <div className="petal-field" aria-hidden="true">
          {Array.from({ length: 16 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#b94b79]">
              Sakura calorie dashboard
            </p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight text-[#4a2032] md:text-5xl">
              Track meals and calculate a realistic weight-loss target.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-[#7b5164]">
              Built for private self-hosting with local browser storage, Google Sheet CSV imports,
              and USDA FoodData Central lookup. The calculator recalculates energy needs as your
              projected weight changes.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 self-end sm:grid-cols-4">
            <Metric label="Maintain" value={round(calculator.maintain)} suffix="kcal" />
            <Metric label="Lose 1 lb/wk" value={round(calculator.loseOne)} suffix="kcal" />
            <Metric label="Lose 2 lb/wk" value={round(calculator.loseTwo)} suffix="kcal" />
            <Metric label={goalMetricLabel} value={round(calculator.goal.calories)} suffix="kcal" />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-5 lg:grid-cols-[360px_minmax(0,1fr)] lg:px-8">
        <aside className="space-y-5">
          <Panel title="User Profiles">
            <div className="space-y-3">
              <label className="field">
                <span>Active profile</span>
                <select
                  value={activeUserProfile.id}
                  onChange={(event) => switchProfile(event.target.value)}
                >
                  {profiles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Profile name</span>
                <input
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                  placeholder="Me"
                />
              </label>
              <div className="profile-actions">
                <button className="secondary" type="button" onClick={renameActiveProfile}>
                  Rename
                </button>
                <button className="secondary" type="button" onClick={createProfile}>
                  Add profile
                </button>
                <button className="danger" type="button" onClick={deleteActiveProfile}>
                  Delete
                </button>
              </div>
              <p className="text-sm leading-6 text-[#8a5b6f]">
                Body, goal, and intake settings follow the selected profile. Foods stay shared,
                while meal logs are kept separate per profile.
              </p>
            </div>
          </Panel>

          <Panel title="Body Profile">
            <div className="grid grid-cols-2 gap-3">
              <label className="field">
                <span>Profile</span>
                <select
                  value={profile.sex}
                  onChange={(event) => updateProfile("sex", event.target.value as Sex)}
                >
                  {Object.entries(sexOptions).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <NumberField label="Age" value={profile.age} onChange={(value) => updateProfile("age", value)} />
              <NumberField label="Height (in)" value={profile.heightIn} onChange={(value) => updateProfile("heightIn", value)} />
              <NumberField label="Weight (lb)" value={profile.weightLb} onChange={(value) => updateProfile("weightLb", value)} />
              <NumberField label="Body fat %" value={profile.bodyFat} onChange={(value) => updateProfile("bodyFat", value)} />
              {(profile.sex === "transFemale" || profile.sex === "transMale") && (
                <NumberField
                  label="HRT years"
                  value={profile.hrtYears}
                  step={0.25}
                  onChange={(value) => updateProfile("hrtYears", value)}
                />
              )}
              <label className="field">
                <span>Activity</span>
                <select
                  value={profile.activity}
                  onChange={(event) => updateProfile("activity", event.target.value as ActivityKey)}
                >
                  {Object.entries(activityLevels).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value.label}
                    </option>
                  ))}
                </select>
              </label>
              <NumberField label="Goal weight" value={profile.goalWeightLb} onChange={(value) => updateProfile("goalWeightLb", value)} />
              <NumberField label="Goal weeks" value={profile.goalWeeks} onChange={(value) => updateProfile("goalWeeks", value)} />
            </div>
          </Panel>

          <Panel title="Daily Log">
            <div className="space-y-3">
              <label className="field">
                <span>Date</span>
                <input value={entryDate} type="date" onChange={(event) => setEntryDate(event.target.value)} />
              </label>
              <label className="field">
                <span>Food</span>
                <select value={selectedFoodId} onChange={(event) => setSelectedFoodId(event.target.value)}>
                  {foods.map((food) => (
                    <option key={food.id} value={food.id}>
                      {food.name} - {food.calories} kcal
                    </option>
                  ))}
                </select>
              </label>
              <NumberField label="Servings" value={quantity} step={0.25} onChange={setQuantity} />
              <button className="primary" type="button" onClick={addLogEntry}>
                Add to day
              </button>
              <div className="rounded-md border border-[#d9d2c2] bg-[#fffdf9] p-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-sm text-[#8a5b6f]">Logged for selected day</p>
                    <p className="text-3xl font-semibold">{round(todayTotal)} kcal</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-[#8a5b6f]">Goal remaining</p>
                    <p className={remainingToday >= 0 ? "text-xl font-semibold text-[#a43a6b]" : "text-xl font-semibold text-[#9f3d49]"}>
                      {round(remainingToday)} kcal
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Panel>
        </aside>

        <div className="space-y-5">
          <section className="grid gap-5 xl:grid-cols-[1fr_390px]">
            <Panel title="Calculator">
              <div className="grid gap-4 md:grid-cols-3">
                <Readout label="BMR" value={`${round(calculator.bmr)} kcal`} note={bmrMethodLabel(profile)} />
                <Readout label="Current maintenance" value={`${round(calculator.tdee)} kcal`} note={`${activityLevels[profile.activity].factor} activity factor`} />
                <Readout
                  label="Goal daily calories"
                  value={`${round(calculator.goal.calories)} kcal`}
                  note={
                    calculator.goal.isBelowRecommended
                      ? `Floor shown; goal needs ${round(calculator.goal.requiredCalories)} kcal/day`
                      : `${profile.goalWeeks} week dynamic projection`
                  }
                  tone={calculator.goal.isBelowRecommended ? "warning" : "default"}
                />
              </div>
              {calculator.goal.isBelowRecommended && (
                <div className="warning mt-4">
                  Your goal settings imply about {calculator.goal.weeklyPace.toFixed(1)} lb per week.
                  The calculated intake would be {round(calculator.goal.requiredCalories)} kcal/day,
                  which is below the app&apos;s {calculator.goal.minRecommended} kcal/day planning floor.
                  Increase goal weeks or choose a higher goal weight for a more realistic target.
                </div>
              )}
              <div className="info-note mt-4">
                <strong>What Goal Daily Calories means:</strong> this is the estimated daily calorie
                target needed to reach your selected goal weight within your selected number of weeks.
                It is separate from the fixed 1, 1.5, and 2 lb/week cards, and it recalculates expected
                maintenance as your projected weight changes.
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Milestone label="0.5 lb per week" calories={calculator.loseHalf} deficit={calculator.tdee - calculator.loseHalf} />
                <Milestone label="1 lb per week" calories={calculator.loseOne} deficit={calculator.tdee - calculator.loseOne} />
                <Milestone label="1.5 lb per week" calories={calculator.loseOneHalf} deficit={calculator.tdee - calculator.loseOneHalf} />
                <Milestone label="2 lb per week" calories={calculator.loseTwo} deficit={calculator.tdee - calculator.loseTwo} />
              </div>
              <p className="mt-4 text-sm leading-6 text-[#66705e]">
                This is an estimate, not medical advice. Body-fat percentage is the strongest input here because
                Katch-McArdle estimates from lean mass without a sex coefficient. Without body fat, trans profiles
                blend the Mifflin-St Jeor sex coefficient over up to 5 years of hormone therapy. The projection uses
                a {CALORIES_PER_POUND.toLocaleString()} kcal per pound energy-balance model and recalculates BMR each day.
              </p>
            </Panel>

            <Panel title="Goal Projection">
              <div className="projection">
                {calculator.goal.projection.points.map((point) => {
                  const range = Math.max(1, maxPointWeight - minPointWeight);
                  const top = ((maxPointWeight - point.weight) / range) * 72 + 8;
                  const left = (point.day / calculator.goal.days) * 100;
                  const pointDate = formatProjectionDate(
                    addDaysIso(projectionStartDate, point.day),
                  );
                  const twoPoundCalories =
                    point.maintenanceCalories - (2 * CALORIES_PER_POUND) / 7;
                  const tooltip = `${pointDate}. Week ${point.week.toFixed(1)}: ${point.weight.toFixed(1)} lb. Target ${round(point.targetCalories)} kcal/day. 2 lb/week estimate ${round(twoPoundCalories)} kcal/day. Maintenance ${round(point.maintenanceCalories)} kcal/day. Deficit ${round(point.deficit)} kcal/day.`;
                  const edgeClass =
                    left < 18
                      ? " projection-dot-left"
                      : left > 82
                        ? " projection-dot-right"
                        : "";
                  return (
                    <span
                      key={`${point.day}-${point.weight}`}
                      className={`projection-dot${edgeClass}`}
                      style={{ left: `${left}%`, top: `${top}%` }}
                      title={tooltip}
                      tabIndex={0}
                      aria-label={tooltip}
                    >
                      <span className="projection-tooltip">
                        <strong>{pointDate}</strong>
                        <span>Week {point.week.toFixed(1)}</span>
                        <span>{point.weight.toFixed(1)} lb projected</span>
                        <span>{round(point.targetCalories)} kcal/day target</span>
                        <span>{round(twoPoundCalories)} kcal/day for 2 lb/week</span>
                        <span>{round(point.maintenanceCalories)} kcal/day maintenance</span>
                        <span>{round(point.deficit)} kcal/day deficit</span>
                      </span>
                    </span>
                  );
                })}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Readout label="Start" value={`${profile.weightLb} lb`} />
                <Readout label="Projected end" value={`${calculator.goal.projection.finalWeight.toFixed(1)} lb`} />
                <Readout label="Start date" value={formatProjectionDate(projectionStartDate)} />
                <Readout label="Projected date" value={formatProjectionDate(projectedEndDate)} />
              </div>
            </Panel>
          </section>

          <Panel title="Intake Timeline">
            <div className="scenario-panel">
              <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                <NumberField
                  label="Calories I eat per day"
                  value={profile.plannedDailyCalories}
                  onChange={(value) => updateProfile("plannedDailyCalories", value)}
                />
                <div>
                  <h3>Timeline at that intake</h3>
                  {calculator.plannedTimeline.canReachGoal ? (
                    <div className="scenario-grid">
                      <Readout
                        label="Average loss"
                        value={`${calculator.plannedTimeline.averageWeeklyLoss.toFixed(2)} lb/wk`}
                        note="Modeled over the full projection"
                      />
                      <Readout
                        label="Time to goal"
                        value={formatDuration(calculator.plannedTimeline.days)}
                        note={formatWeekDay(calculator.plannedTimeline.days)}
                      />
                      <Readout
                        label="End date"
                        value={formatProjectionDate(plannedEndDate)}
                        note={`${profile.goalWeightLb} lb goal`}
                      />
                    </div>
                  ) : (
                    <div className="warning">
                      {calculator.plannedTimeline.reason} Estimated average loss is{" "}
                      {calculator.plannedTimeline.averageWeeklyLoss.toFixed(2)} lb/week.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Panel>

          <section className="grid gap-5 xl:grid-cols-2">
            <Panel title="Food Library">
              <form className="grid gap-3 md:grid-cols-4" onSubmit={addManualFood}>
                <label className="field md:col-span-2">
                  <span>Food name</span>
                  <input value={newFood.name} onChange={(event) => setNewFood((current) => ({ ...current, name: event.target.value }))} placeholder="Homemade chili" />
                </label>
                <label className="field">
                  <span>Serving</span>
                  <input value={newFood.serving} onChange={(event) => setNewFood((current) => ({ ...current, serving: event.target.value }))} placeholder="1 bowl" />
                </label>
                <label className="field">
                  <span>Calories</span>
                  <input value={newFood.calories} type="number" onChange={(event) => setNewFood((current) => ({ ...current, calories: event.target.value }))} placeholder="430" />
                </label>
                <label className="field md:col-span-3">
                  <span>Source</span>
                  <input value={newFood.source} onChange={(event) => setNewFood((current) => ({ ...current, source: event.target.value }))} placeholder="Recipe, restaurant, label" />
                </label>
                <button className="primary self-end" type="submit">
                  Save food
                </button>
              </form>
              <FoodTable foods={foods} />
            </Panel>

            <Panel title="Import">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <label className="field">
                    <span>Published Google Sheet CSV URL</span>
                    <input value={csvUrl} onChange={(event) => setCsvUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/.../pub?output=csv" />
                  </label>
                  <button className="secondary self-end" type="button" onClick={importCsvUrl}>
                    Fetch CSV
                  </button>
                </div>
                <label className="field">
                  <span>Paste CSV</span>
                  <textarea value={csvText} onChange={(event) => setCsvText(event.target.value)} placeholder="Food,Serving,Calories,Source&#10;Turkey sandwich,1 sandwich,520,Home" />
                </label>
                <button className="secondary" type="button" onClick={() => importCsv(csvText)}>
                  Import pasted rows
                </button>
              </div>
            </Panel>
          </section>

          <section className="grid gap-5 xl:grid-cols-[430px_1fr]">
            <Panel title="USDA Food Lookup">
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <label className="field">
                    <span>Search</span>
                    <input value={fdcQuery} onChange={(event) => setFdcQuery(event.target.value)} placeholder="oats, chicken breast, apple" />
                  </label>
                  <button className="primary self-end" type="button" onClick={searchFdc}>
                    Search USDA
                  </button>
                </div>
                <p className="text-sm leading-6 text-[#66705e]">
                  USDA imports use a server-side FoodData Central key from FDC_API_KEY. Branded items still depend
                  on manufacturer data, so labels and weighed servings remain the best source for precision.
                </p>
              </div>
            </Panel>

            <Panel title="Search Results">
              <div className="grid max-h-80 gap-3 overflow-auto pr-1">
                {fdcResults.length === 0 ? (
                  <p className="text-sm text-[#66705e]">USDA results will appear here.</p>
                ) : (
                  fdcResults.map((result) => (
                    <button key={result.fdcId} className="result" type="button" onClick={() => importFdcFood(result)}>
                      <span>
                        <strong>{result.description.toLowerCase()}</strong>
                        <small>{result.brandOwner || "USDA FoodData Central"}</small>
                      </span>
                      <span>{round(nutrient(result, "energy"))} kcal</span>
                    </button>
                  ))
                )}
              </div>
            </Panel>
          </section>

          <Panel title="Recent Entries">
            <div className="entry-list">
              {profileLog.length === 0 ? (
                <p className="text-sm text-[#66705e]">No meals logged yet.</p>
              ) : (
                profileLog.slice(0, 10).map((entry) => (
                  <div key={entry.id} className="entry">
                    <span>
                      <strong>{entry.name}</strong>
                      <small>
                        {entry.date} - {entry.quantity} x {entry.serving}
                      </small>
                    </span>
                    <span>{round(entry.calories * entry.quantity)} kcal</span>
                    <button type="button" onClick={() => setLog((current) => current.filter((item) => item.id !== entry.id))}>
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </section>

      {status && <div className="status">{status}</div>}
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel-shell rounded-md border border-[#f0bdd0] bg-[#fffafd] p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-[#5a263b]">{title}</h2>
      {children}
    </section>
  );
}

function Metric({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return (
    <div className="metric-card rounded-md border border-[#f0bdd0] bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#a85076]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#4a2032]">{value}</p>
      <p className="text-xs text-[#8a5b6f]">{suffix} / day</p>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Readout({
  label,
  value,
  note,
  tone = "default",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "default" | "warning";
}) {
  return (
    <div className={tone === "warning" ? "readout-warning" : "rounded-md bg-[#fff0f6] p-3"}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#a85076]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#4a2032]">{value}</p>
      {note && <p className="mt-1 text-xs text-[#8a5b6f]">{note}</p>}
    </div>
  );
}

function Milestone({ label, calories, deficit }: { label: string; calories: number; deficit: number }) {
  return (
    <div className="rounded-md border border-[#f1c4d4] bg-[#fffafd] p-3">
      <p className="font-semibold">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{round(calories)} kcal</p>
      <p className="text-sm text-[#8a5b6f]">{round(deficit)} kcal daily deficit</p>
    </div>
  );
}

function FoodTable({ foods }: { foods: Food[] }) {
  return (
    <div className="mt-4 max-h-72 overflow-auto rounded-md border border-[#e0dacb]">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr>
            <th>Food</th>
            <th>Serving</th>
            <th>Calories</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {foods.map((food) => (
            <tr key={food.id}>
              <td>{food.name}</td>
              <td>{food.serving}</td>
              <td>{food.calories}</td>
              <td>{food.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
