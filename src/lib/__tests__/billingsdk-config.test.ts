import { describe, expect, it } from "vitest";
import { type CurrentPlan, type Plan, plans } from "../billingsdk-config";

describe("billingsdk-config", () => {
  describe("plans array", () => {
    it("is defined and non-empty", () => {
      expect(plans).toBeDefined();
      expect(Array.isArray(plans)).toBe(true);
      expect(plans.length).toBeGreaterThan(0);
    });

    it("contains free plan", () => {
      const freePlan = plans.find((p) => p.id === "free");

      expect(freePlan).toBeDefined();
      expect(freePlan?.title).toBe("Free");
      expect(freePlan?.monthlyPrice).toBe("0");
    });

    it("contains premium plan", () => {
      const premiumPlan = plans.find((p) => p.id === "premium");

      expect(premiumPlan).toBeDefined();
      expect(premiumPlan?.title).toBe("Premium");
    });

    it("premium plan is highlighted", () => {
      const premiumPlan = plans.find((p) => p.id === "premium");

      expect(premiumPlan?.highlight).toBe(true);
    });

    it("each plan has required properties", () => {
      for (const plan of plans) {
        expect(plan.id).toBeDefined();
        expect(typeof plan.id).toBe("string");

        expect(plan.title).toBeDefined();
        expect(typeof plan.title).toBe("string");

        expect(plan.description).toBeDefined();
        expect(typeof plan.description).toBe("string");

        expect(plan.monthlyPrice).toBeDefined();
        expect(plan.yearlyPrice).toBeDefined();

        expect(plan.buttonText).toBeDefined();
        expect(typeof plan.buttonText).toBe("string");

        expect(plan.features).toBeDefined();
        expect(Array.isArray(plan.features)).toBe(true);
        expect(plan.features.length).toBeGreaterThan(0);
      }
    });

    it("each feature has required properties", () => {
      for (const plan of plans) {
        for (const feature of plan.features) {
          expect(feature.name).toBeDefined();
          expect(typeof feature.name).toBe("string");

          expect(feature.icon).toBeDefined();
          expect(typeof feature.icon).toBe("string");
        }
      }
    });

    it("plan ids are unique", () => {
      const ids = plans.map((p) => p.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("Plan type", () => {
    it("allows creating a valid plan object", () => {
      const testPlan: Plan = {
        id: "test",
        title: "Test Plan",
        description: "A test plan",
        monthlyPrice: "5",
        yearlyPrice: "50",
        buttonText: "Get Test",
        features: [{ name: "Test Feature", icon: "check" }],
      };

      expect(testPlan.id).toBe("test");
      expect(testPlan.features.length).toBe(1);
    });

    it("allows optional properties", () => {
      const testPlan: Plan = {
        id: "test",
        title: "Test Plan",
        description: "A test plan",
        monthlyPrice: "5",
        yearlyPrice: "50",
        buttonText: "Get Test",
        features: [],
        highlight: true,
        badge: "New",
        type: "monthly",
        currency: "€",
      };

      expect(testPlan.highlight).toBe(true);
      expect(testPlan.badge).toBe("New");
      expect(testPlan.type).toBe("monthly");
      expect(testPlan.currency).toBe("€");
    });
  });

  describe("CurrentPlan type", () => {
    it("allows creating a valid current plan object", () => {
      const freePlan = plans.find((p) => p.id === "free");
      if (!freePlan) {
        throw new Error("Free plan not found");
      }

      const currentPlan: CurrentPlan = {
        plan: freePlan,
        type: "monthly",
        nextBillingDate: "2024-02-01",
        paymentMethod: "Credit Card",
        status: "active",
      };

      expect(currentPlan.status).toBe("active");
      expect(currentPlan.type).toBe("monthly");
    });

    it("allows various status values", () => {
      const freePlan = plans.find((p) => p.id === "free");
      if (!freePlan) {
        throw new Error("Free plan not found");
      }

      const statuses: CurrentPlan["status"][] = ["active", "inactive", "past_due", "cancelled"];

      for (const status of statuses) {
        const currentPlan: CurrentPlan = {
          plan: freePlan,
          type: "monthly",
          nextBillingDate: "2024-02-01",
          paymentMethod: "Credit Card",
          status,
        };

        expect(currentPlan.status).toBe(status);
      }
    });

    it("allows custom type", () => {
      const freePlan = plans.find((p) => p.id === "free");
      if (!freePlan) {
        throw new Error("Free plan not found");
      }

      const currentPlan: CurrentPlan = {
        plan: freePlan,
        type: "custom",
        nextBillingDate: "2024-02-01",
        paymentMethod: "Invoice",
        status: "active",
        price: "$100",
      };

      expect(currentPlan.type).toBe("custom");
      expect(currentPlan.price).toBe("$100");
    });
  });
});
