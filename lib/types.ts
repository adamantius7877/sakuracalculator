export type Sex = "male" | "female" | "transFemale" | "transMale";

export type ActivityKey =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very-active";

export type Profile = {
  sex: Sex;
  age: number;
  heightIn: number;
  weightLb: number;
  bodyFat: number;
  hrtYears: number;
  activity: ActivityKey;
  goalWeightLb: number;
  goalWeeks: number;
  plannedDailyCalories: number;
};

export type UserProfile = {
  id: string;
  name: string;
  profile: Profile;
};

export type Food = {
  id: string;
  name: string;
  source: string;
  serving: string;
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
};

export type LogEntry = {
  id: string;
  profileId: string;
  foodId?: string;
  name: string;
  serving: string;
  quantity: number;
  calories: number;
  date: string;
};

export type DashboardState = {
  profiles: UserProfile[];
  activeProfileId: string;
  foods: Food[];
  log: LogEntry[];
};
