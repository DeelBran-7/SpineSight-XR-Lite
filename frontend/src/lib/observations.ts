import type { ChatMessage } from "./api";

export const analysisQuestions = [
  "What does my shoulder measurement mean?",
  "How is torso lean calculated?",
  "What can affect these measurements?",
];

export const generalQuestions = [
  "How should I position the camera?",
  "What can I learn from a back-view photo?",
  "How are photos and measurements handled?",
];

export function describeLevel(direction: string) {
  switch (direction) {
    case "left_landmark_higher_in_image":
      return "The model’s left landmark appears higher in the photo.";
    case "right_landmark_higher_in_image":
      return "The model’s right landmark appears higher in the photo.";
    case "aligned_with_image_horizontal":
      return "The two landmarks are at the same height in the photo.";
    default:
      return "The offset describes the vertical difference between the two landmarks.";
  }
}

export function describeTorso(direction: string) {
  switch (direction) {
    case "leftward_lateral_offset":
      return "The shoulder midpoint is left of the hip midpoint in the photo.";
    case "rightward_lateral_offset":
      return "The shoulder midpoint is right of the hip midpoint in the photo.";
    case "no_lateral_offset":
      return "The shoulder midpoint is directly above the hip midpoint in the photo.";
    default:
      return "The angle compares the shoulder and hip midpoints with the image vertical.";
  }
}

const number = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const signedNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 2, signDisplay: "exceptZero" });

export function formatPercent(value: number) {
  return `${number.format(value)}%`;
}

export function formatAngle(value: number) {
  return `${signedNumber.format(value)}°`;
}
export function explainOffset(value: number) {
  return `${number.format(value)} units of height difference for every 100 units of horizontal distance between the points.`;
}

/** Only completed, adjacent question/answer pairs can be reused by the UI. */
export function findPreviousAnswer(messages: ChatMessage[], question: string): number | null {
  const normalize = (text: string) => text.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
  const target = normalize(question);
  if (!target) return null;
  for (let index = messages.length - 2; index >= 0; index -= 1) {
    if (messages[index].role === "user" && normalize(messages[index].content) === target
      && messages[index + 1].role === "assistant" && messages[index + 1].content.trim()) return index + 1;
  }
  return null;
}
