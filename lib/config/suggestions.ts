import {
  BookOpenTextIcon,
  BrainIcon,
  CodeIcon,
  LightbulbIcon,
  NotepadIcon,
  PaintBrushIcon,
  SparkleIcon,
} from "@phosphor-icons/react/dist/ssr";

export const SUGGESTIONS = [
  {
    label: "Summary",
    highlight: "Summarize",
    prompt: "Summarize",
    items: [
      "Summarize the French Revolution",
      "Summarize the plot of Inception",
      "Summarize World War II in 5 sentences",
      "Summarize the benefits of meditation",
    ],
    icon: NotepadIcon,
  },
  {
    label: "Code",
    highlight: "Help me",
    prompt: "Help me",
    items: [
      "Help me write a function to reverse a string in JavaScript",
      "Help me create a responsive navbar in HTML/CSS",
      "Help me write a SQL query to find duplicate emails",
      "Help me convert this Python function to JavaScript",
    ],
    icon: CodeIcon,
  },
  {
    label: "Design",
    highlight: "Design",
    prompt: "Design",
    items: [
      "Design a color palette for a tech blog",
      "Design a UX checklist for mobile apps",
      "Design 5 great font pairings for a landing page",
      "Design better CTAs with useful tips",
    ],
    icon: PaintBrushIcon,
  },
  {
    label: "Research",
    highlight: "Research",
    prompt: "Research",
    items: [
      "Research the pros and cons of remote work",
      "Research the differences between Apple Vision Pro and Meta Quest",
      "Research best practices for password security",
      "Research the latest trends in renewable energy",
    ],
    icon: BookOpenTextIcon,
  },
  {
    label: "Get inspired",
    highlight: "Inspire me",
    prompt: "Inspire me",
    items: [
      "Inspire me with a beautiful quote about creativity",
      "Inspire me with a writing prompt about solitude",
      "Inspire me with a poetic way to start a newsletter",
      "Inspire me by describing a peaceful morning in nature",
    ],
    icon: SparkleIcon,
  },
  {
    label: "Think deeply",
    highlight: "Reflect on",
    prompt: "Reflect on",
    items: [
      "Reflect on why we fear uncertainty",
      "Reflect on what makes a conversation meaningful",
      "Reflect on the concept of time in a simple way",
      "Reflect on what it means to live intentionally",
    ],
    icon: BrainIcon,
  },
  {
    label: "Learn gently",
    highlight: "Explain",
    prompt: "Explain",
    items: [
      "Explain quantum physics like I'm 10",
      "Explain stoicism in simple terms",
      "Explain how a neural network works",
      "Explain the difference between AI and AGI",
    ],
    icon: LightbulbIcon,
  },
];
