export interface Plan {
  id: string;
  title: string;
  description: string;
  highlight?: boolean;
  type?: "monthly" | "yearly";
  currency?: string;
  monthlyPrice: string;
  yearlyPrice: string;
  buttonText: string;
  badge?: string;
  features: {
    name: string;
    icon: string;
    iconColor?: string;
  }[];
}

export interface CurrentPlan {
  plan: Plan;
  type: "monthly" | "yearly" | "custom";
  price?: string;
  nextBillingDate: string;
  paymentMethod: string;
  status: "active" | "inactive" | "past_due" | "cancelled";
}

export const plans: Plan[] = [
  {
    id: "free",
    title: "Free",
    description: "Intelligence for everyday tasks",
    currency: "$",
    monthlyPrice: "0",
    yearlyPrice: "0",
    buttonText: "Your current plan",
    features: [
      {
        name: "Access to Basic Models",
        icon: "check",
        iconColor: "text-green-500",
      },
      {
        name: "20 Messages a day",
        icon: "check",
        iconColor: "text-green-500",
      },
      {
        name: "Limited file uploads",
        icon: "check",
        iconColor: "text-muted-foreground",
      },
      {
        name: "Limited context",
        icon: "check",
        iconColor: "text-muted-foreground",
      },
    ],
  },
  {
    id: "premium",
    title: "Premium",
    description: "More access to popular features",
    currency: "$",
    monthlyPrice: "10",
    yearlyPrice: "120",
    buttonText: "Upgrade to Premium",
    badge: "Most popular",
    highlight: true,
    features: [
      {
        name: "Access to All Models",
        icon: "check",
        iconColor: "text-green-500",
      },
      {
        name: "Generous Limits",
        icon: "check",
        iconColor: "text-blue-500",
      },
      {
        name: "Longer memory and context",
        icon: "check",
        iconColor: "text-purple-500",
      },
      {
        name: "Background Agents",
        icon: "check",
        iconColor: "text-blue-500",
      },
    ],
  },
];
