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
      return "The left landmark appears higher in the photo.";
    case "right_landmark_higher_in_image":
      return "The right landmark appears higher in the photo.";
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
