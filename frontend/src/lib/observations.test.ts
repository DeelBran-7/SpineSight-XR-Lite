import { describe, expect, it } from "vitest";
import { describeLevel, describeTorso, formatAngle, formatPercent } from "./observations";

describe("result labels", () => {
  it("preserves positive and negative directions and suppresses signed zero", () => {
    expect(formatAngle(2.455)).toBe("+2.46°");
    expect(formatAngle(-2.455)).toBe("-2.46°");
    expect(formatAngle(-0.0001)).toBe("0°");
    expect(formatPercent(10.441)).toBe("10.44%");
  });

  it("describes measurements in the photo using rule direction", () => {
    expect(describeLevel("left_landmark_higher_in_image")).toContain("left landmark");
    expect(describeLevel("aligned_with_image_horizontal")).toContain("same height");
    expect(describeTorso("rightward_lateral_offset")).toContain("right of the hip midpoint");
    expect(describeTorso("no_lateral_offset")).toContain("directly above");
  });
});
