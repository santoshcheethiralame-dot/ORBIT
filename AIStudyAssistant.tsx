// AIStudyAssistant.tsx: Main UI logic for world-class prompt generation, smart AI provider recommendations, and user-centric study session customization.

import React, { useState, useEffect } from "react";
import {
  X, Copy, Check, Sparkles, Brain, MessageSquare, Zap,
  History, Settings, ChevronDown, ChevronUp, Edit3, Save,
  TrendingUp, Clock, Target, Bookmark, Download, Upload,
  RefreshCw, Wand2, Flame, Star, AlertCircle, Info, Lightbulb,
  BookOpen, Code, FileText, Search, PenTool, Calculator
} from "lucide-react";
import { StudyBlock } from "./types";

interface SubjectIntelligence {
  nextExam?: string;
  readiness?: number;
  lastStudied?: string;
  recentQuality?: number;
  weakTopics?: string[];
}

interface AIStudyAssistantProps {
  block: StudyBlock;
  subjectIntelligence?: SubjectIntelligence;
  onClose: () => void;
}

type AIProvider = 'chatgpt' | 'claude' | 'gemini' | 'perplexity';

interface ProviderConfig {
  id: AIProvider;
  name: string;
  icon: React.ReactNode;
  url: (prompt: string) => string;
  color: string;
  gradient: string;
  supportsAutoFill: boolean;
  strengths: string[];
  bestFor: string[];
  recommendedFor: {
    types: string[];
    subjects: string[];
    complexity: ('simple' | 'medium' | 'complex')[];
  };
}

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  sections: string[];
  intensity: 'minimal' | 'balanced' | 'comprehensive';
  bloomLevel?: string;
}

interface PromptHistory {
  id: string;
  timestamp: number;
  provider: AIProvider;
  subjectName: string;
  sessionType: string;
  promptPreview: string;
  wasEffective?: boolean;
  rating?: 1 | 2 | 3 | 4 | 5;
}

interface CustomSection {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
}

export const AIStudyAssistant: React.FC<AIStudyAssistantProps> = ({
  block,
  subjectIntelligence,
  onClose,
}) => {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<AIProvider | null>(null);
  const [activeTab, setActiveTab] = useState<'launch' | 'customize' | 'history' | 'templates'>('launch');
  const [customQuestion, setCustomQuestion] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("balanced");
  const [customSections, setCustomSections] = useState<CustomSection[]>([]);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [promptIntensity, setPromptIntensity] = useState<'minimal' | 'balanced' | 'comprehensive'>('balanced');
  const [bloomLevel, setBloomLevel] = useState<string>("understand");
  const [promptHistory, setPromptHistory] = useState<PromptHistory[]>([]);
  const [favoriteProviders, setFavoriteProviders] = useState<AIProvider[]>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [mostEffectiveProvider, setMostEffectiveProvider] = useState<AIProvider | null>(null);
  const [showProviderRecommendation, setShowProviderRecommendation] = useState(true);
  const [learningObjective, setLearningObjective] = useState("");

  useEffect(() => {
    loadUserPreferences();
    loadPromptHistory();
  }, []);

  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'c') {
          e.preventDefault();
          copyPrompt();
        }
        if (e.key === 'p') {
          e.preventDefault();
          setShowPromptPreview(!showPromptPreview);
        }
      }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [showPromptPreview]);

  const templates: PromptTemplate[] = [
    {
      id: 'minimal',
      name: 'Quick Query',
      description: 'Fast, focused questions',
      sections: ['context', 'question'],
      intensity: 'minimal',
      bloomLevel: 'remember'
    },
    {
      id: 'balanced',
      name: 'Standard Session',
      description: 'Comprehensive learning session',
      sections: ['context', 'intelligence', 'philosophy', 'strategy', 'bloom', 'question'],
      intensity: 'balanced',
      bloomLevel: 'understand'
    },
    {
      id: 'comprehensive',
      name: 'Deep Mastery',
      description: 'Maximum context & coaching',
      sections: ['context', 'intelligence', 'weakAreas', 'philosophy', 'strategy', 'bloom', 'metacognition', 'examples', 'question'],
      intensity: 'comprehensive',
      bloomLevel: 'analyze'
    },
    {
      id: 'exam-prep',
      name: 'Exam Mode',
      description: 'High-stakes exam preparation',
      sections: ['context', 'intelligence', 'weakAreas', 'exam-strategy', 'practice', 'bloom', 'pressure-training', 'question'],
      intensity: 'comprehensive',
      bloomLevel: 'apply'
    },
    {
      id: 'problem-solving',
      name: 'Problem Solver',
      description: 'Guided problem-solving approach',
      sections: ['context', 'problem-framework', 'socratic', 'bloom', 'question'],
      intensity: 'balanced',
      bloomLevel: 'apply'
    },
    {
      id: 'project-guide',
      name: 'Project Mentor',
      description: 'Project planning & execution',
      sections: ['context', 'project-context', 'milestones', 'philosophy', 'bloom', 'question'],
      intensity: 'balanced',
      bloomLevel: 'create'
    },
    {
      id: 'research',
      name: 'Research Assistant',
      description: 'Deep research & synthesis',
      sections: ['context', 'research-framework', 'critical-thinking', 'bloom', 'question'],
      intensity: 'comprehensive',
      bloomLevel: 'evaluate'
    }
  ];

  const providers: ProviderConfig[] = [
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      icon: <MessageSquare size={24} />,
      url: (prompt) => `https://chat.openai.com/?q=${encodeURIComponent(prompt)}`,
      color: 'rgb(16, 163, 127)',
      gradient: 'from-emerald-500/20 to-teal-500/20',
      supportsAutoFill: true,
      strengths: ['Step-by-step explanations', 'Code generation', 'Math problem solving', 'Quick answers'],
      bestFor: ['Programming', 'Mathematics', 'Physics', 'Engineering'],
      recommendedFor: {
        types: ['assignment', 'review', 'project'],
        subjects: ['math', 'physics', 'computer', 'engineering', 'code'],
        complexity: ['simple', 'medium', 'complex']
      }
    },
    {
      id: 'claude',
      name: 'Claude',
      icon: <Brain size={24} />,
      url: (prompt) => `https://claude.ai/new?q=${encodeURIComponent(prompt)}`,
      color: 'rgb(196, 181, 253)',
      gradient: 'from-purple-500/20 to-violet-500/20',
      supportsAutoFill: true,
      strengths: ['Deep analysis', 'Essay writing', 'Complex reasoning', 'Nuanced understanding'],
      bestFor: ['Literature', 'Philosophy', 'History', 'Writing', 'Critical thinking'],
      recommendedFor: {
        types: ['assignment', 'review', 'prep', 'project'],
        subjects: ['literature', 'history', 'philosophy', 'writing', 'essay', 'english'],
        complexity: ['medium', 'complex']
      }
    },
    {
      id: 'gemini',
      name: 'Gemini',
      icon: <Sparkles size={24} />,
      url: (prompt) => `https://gemini.google.com/app?q=${encodeURIComponent(prompt)}`,
      color: 'rgb(59, 130, 246)',
      gradient: 'from-blue-500/20 to-indigo-500/20',
      supportsAutoFill: true,
      strengths: ['Research synthesis', 'Multimodal learning', 'Quick facts', 'Broad knowledge'],
      bestFor: ['Sciences', 'General research', 'Fact-checking', 'Overview learning'],
      recommendedFor: {
        types: ['review', 'prep', 'recovery'],
        subjects: ['biology', 'chemistry', 'science', 'research', 'general'],
        complexity: ['simple', 'medium']
      }
    },
    {
      id: 'perplexity',
      name: 'Perplexity',
      icon: <Search size={24} />,
      url: (prompt) => `https://www.perplexity.ai/?q=${encodeURIComponent(prompt)}`,
      color: 'rgb(34, 211, 238)',
      gradient: 'from-cyan-500/20 to-blue-500/20',
      supportsAutoFill: false,
      strengths: ['Source citations', 'Current information', 'Research summaries', 'Fact verification'],
      bestFor: ['Current events', 'Research projects', 'Fact-finding', 'Citation-heavy work'],
      recommendedFor: {
        types: ['project', 'assignment', 'research'],
        subjects: ['history', 'current', 'research', 'news', 'citation'],
        complexity: ['medium', 'complex']
      }
    },
  ];

  const getRecommendedProvider = (): AIProvider => {
    const subjectLower = block.subjectName.toLowerCase();
    const sessionType = block.type;
    for (const provider of providers) {
      if (provider.recommendedFor.types.includes(sessionType)) {
        for (const keyword of provider.recommendedFor.subjects) {
          if (subjectLower.includes(keyword)) {
            return provider.id;
          }
        }
      }
    }
    if (sessionType === 'assignment') return 'chatgpt';
    if (sessionType === 'project') return 'claude';
    if (sessionType === 'review') return 'gemini';
    return 'chatgpt';
  };

  const generateStudyPrompt = (options?: {
    template?: string;
    question?: string;
    includeSections?: string[];
  }): string => {
    const template = templates.find(t => t.id === (options?.template || selectedTemplate)) || templates[1];
    const sections = options?.includeSections || template.sections;
    const userQuestion = options?.question || customQuestion;

    let prompt = '';

    if (template.intensity !== 'minimal') {
      prompt += `You are an elite study coach and learning strategist. Your mission: facilitate deep, lasting understanding through active learning.\n\n`;
      prompt += `⚠️ CRITICAL: This is NOT a passive Q&A. You are coaching me to THINK, not replacing my thinking.\n\n`;
    }

    if (sections.includes('context')) {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `📚 SESSION CONTEXT\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `• Subject: ${block.subjectName}\n`;
      prompt += `• Session Type: ${block.type.charAt(0).toUpperCase() + block.type.slice(1)}\n`;
      prompt += `• Time Budget: ${block.duration} minutes\n`;
      if (block.notes) prompt += `• Topic: ${block.notes}\n`;
      if (block.topicId) prompt += `• Specific Focus: ${block.topicId.replace(/-/g, ' ')}\n`;
      if (learningObjective) prompt += `• Learning Objective: ${learningObjective}\n`;
      prompt += `\n`;
    }

    if (sections.includes('intelligence') && subjectIntelligence) {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `📊 CURRENT MASTERY STATUS\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      if (subjectIntelligence.readiness !== undefined) {
        const status = subjectIntelligence.readiness < 35 ? ' 🆘 CRITICAL - Urgent Review Needed' :
          subjectIntelligence.readiness < 70 ? ' 📈 Building - Consistent Progress' : ' ✅ Strong - Maintain & Deepen';
        prompt += `Readiness Score: ${subjectIntelligence.readiness}%${status}\n`;
      }
      if (subjectIntelligence.nextExam) prompt += `Next Exam: ${subjectIntelligence.nextExam}\n`;
      if (subjectIntelligence.lastStudied) prompt += `Last Studied: ${subjectIntelligence.lastStudied}\n`;
      if (subjectIntelligence.recentQuality) {
        const qualityStatus = subjectIntelligence.recentQuality >= 4 ? ' (High quality sessions)' :
          subjectIntelligence.recentQuality >= 3 ? ' (Moderate quality)' : ' (Needs improvement)';
        prompt += `Recent Session Quality: ${subjectIntelligence.recentQuality}/5 ⭐${qualityStatus}\n`;
      }
      prompt += `\n`;
    }

    if (sections.includes('weakAreas') && subjectIntelligence?.weakTopics?.length) {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `🎯 KNOWLEDGE GAPS (PRIORITY TARGETS)\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      subjectIntelligence.weakTopics.forEach((topic, idx) => {
        prompt += `${idx + 1}. ${topic}\n`;
      });
      prompt += `\n⚠️ When addressing these topics, probe my understanding before explaining.\n\n`;
    }

    if (sections.includes('philosophy')) {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `🎯 MY LEARNING PRINCIPLES\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `CORE VALUES:\n`;
      prompt += `✓ Deep Understanding > Surface Memorization\n`;
      prompt += `✓ Active Recall > Passive Re-reading\n`;
      prompt += `✓ Conceptual Frameworks > Isolated Facts\n`;
      prompt += `✓ Productive Struggle > Easy Answers\n`;
      prompt += `✓ Making Connections > Siloed Knowledge\n`;
      prompt += `\n`;
      prompt += `FORBIDDEN PRACTICES:\n`;
      prompt += `✗ Spoon-feeding complete solutions\n`;
      prompt += `✗ Doing my thinking for me\n`;
      prompt += `✗ Lengthy explanations without checking understanding\n`;
      prompt += `✗ Moving forward without confirming comprehension\n`;
      prompt += `\n`;
    }

    if (sections.includes('strategy')) {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `📋 YOUR COACHING APPROACH\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `1. SOCRATIC METHOD: Ask guiding questions before explaining\n`;
      prompt += `2. ACTIVE VERIFICATION: Test my understanding frequently with quick checks\n`;
      prompt += `3. CONCISE PRECISION: Be clear and structured, not wordy\n`;
      prompt += `4. CONCRETE EXAMPLES: Use real-world analogies and specific instances\n`;
      prompt += `5. PROGRESSIVE DIFFICULTY: Start simple, build complexity systematically\n`;
      prompt += `6. ERROR ANALYSIS: When I make mistakes, help me understand WHY\n`;
      prompt += `7. TIME-AWARE: Respect my ${block.duration}-minute time constraint\n`;
      prompt += `\n`;
    }

    if (sections.includes('bloom')) {
      const bloomLevels = {
        'remember': 'Recall and Recognition',
        'understand': 'Comprehension and Explanation',
        'apply': 'Using Knowledge in New Situations',
        'analyze': 'Breaking Down and Examining',
        'evaluate': 'Critical Judgment',
        'create': 'Producing New Work'
      };
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `🎓 COGNITIVE DEPTH TARGET\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `Target Level: ${bloomLevels[bloomLevel as keyof typeof bloomLevels] || bloomLevels.understand}\n`;
      if (bloomLevel === 'remember') {
        prompt += `• Focus: Can I recall key facts, terms, and concepts?\n`;
        prompt += `• Test with: Quick-fire questions, flashcard-style checks\n`;
      } else if (bloomLevel === 'understand') {
        prompt += `• Focus: Can I explain concepts in my own words?\n`;
        prompt += `• Test with: "Explain this as if to a friend", paraphrase challenges\n`;
      } else if (bloomLevel === 'apply') {
        prompt += `• Focus: Can I use this knowledge to solve new problems?\n`;
        prompt += `• Test with: Novel scenarios, practical applications\n`;
      } else if (bloomLevel === 'analyze') {
        prompt += `• Focus: Can I break down complex ideas and see relationships?\n`;
        prompt += `• Test with: Compare/contrast, cause-effect analysis\n`;
      } else if (bloomLevel === 'evaluate') {
        prompt += `• Focus: Can I make informed judgments and critiques?\n`;
        prompt += `• Test with: Argue positions, evaluate solutions\n`;
      } else if (bloomLevel === 'create') {
        prompt += `• Focus: Can I synthesize knowledge to produce something new?\n`;
        prompt += `• Test with: Design challenges, creative solutions\n`;
      }
      prompt += `\n`;
    }

    if (sections.includes('exam-strategy') && template.id === 'exam-prep') {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `🎓 EXAM PREPARATION PROTOCOL\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `• Identify highest-yield topics from weak areas\n`;
      prompt += `• Generate practice problems at exam-level difficulty\n`;
      prompt += `• Test speed AND accuracy (time-pressured practice)\n`;
      prompt += `• Simulate exam pressure & decision-making\n`;
      prompt += `• Review common mistakes & misconceptions in this subject\n`;
      prompt += `• Create mental frameworks for rapid problem-solving\n`;
      prompt += `\n`;
    }

    if (sections.includes('practice')) {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `📝 PRACTICE PROBLEM GENERATION RULES\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `• Start: Concept-check questions (do I understand the basics?)\n`;
      prompt += `• Progress: Application problems (can I use this?)\n`;
      prompt += `• Advance: Synthesis questions (can I combine concepts?)\n`;
      prompt += `• Provide HINTS, not answers\n`;
      prompt += `• Let me struggle productively before intervening\n`;
      prompt += `• After solving, ask "What would make this harder?"\n`;
      prompt += `\n`;
    }

    if (sections.includes('pressure-training')) {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `⚡ HIGH-PRESSURE TRAINING\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `• Give me time constraints for each problem\n`;
      prompt += `• Include "distractors" and common traps\n`;
      prompt += `• Simulate imperfect information scenarios\n`;
      prompt += `• Challenge me to explain under time pressure\n`;
      prompt += `\n`;
    }

    if (sections.includes('problem-framework')) {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `🔍 PROBLEM-SOLVING FRAMEWORK\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `1. UNDERSTAND: Help me clarify what's being asked\n`;
      prompt += `2. PLAN: Guide me to identify approach (don't give it away)\n`;
      prompt += `3. EXECUTE: Watch me work, intervene only if stuck\n`;
      prompt += `4. VERIFY: Help me check my solution critically\n`;
      prompt += `5. REFLECT: "What did you learn? What would you do differently?"\n`;
      prompt += `\n`;
    }

    if (sections.includes('socratic')) {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `💭 SOCRATIC DIALOGUE MODE\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `• Lead with questions, not answers\n`;
      prompt += `• Build on my responses to deepen understanding\n`;
      prompt += `• Expose gaps through gentle probing\n`;
      prompt += `• Let me discover insights (don't spoil the "aha" moment)\n`;
      prompt += `\n`;
    }

    if (sections.includes('project-context') && block.type === 'project') {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `🎯 PROJECT MENTORSHIP APPROACH\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `• Help me break down complex requirements into manageable pieces\n`;
      prompt += `• Review my architectural decisions (play devil's advocate)\n`;
      prompt += `• Suggest multiple implementation approaches, let me choose\n`;
      prompt += `• Identify potential pitfalls proactively\n`;
      prompt += `• Keep me focused on the NEXT actionable step\n`;
      prompt += `• Challenge scope creep and over-engineering\n`;
      prompt += `\n`;
    }

    if (sections.includes('research-framework')) {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `🔬 RESEARCH METHODOLOGY\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `• Help me develop strong research questions\n`;
      prompt += `• Guide me to evaluate source credibility\n`;
      prompt += `• Teach me to synthesize across multiple sources\n`;
      prompt += `• Challenge my assumptions and biases\n`;
      prompt += `• Help me identify gaps in my research\n`;
      prompt += `\n`;
    }

    if (sections.includes('critical-thinking')) {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `🧠 CRITICAL THINKING PROTOCOLS\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `• Ask: "What evidence supports this?"\n`;
      prompt += `• Challenge: "What's the counter-argument?"\n`;
      prompt += `• Probe: "What assumptions are we making?"\n`;
      prompt += `• Connect: "How does this relate to other concepts?"\n`;
      prompt += `\n`;
    }

    if (sections.includes('metacognition')) {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `🪞 METACOGNITIVE MONITORING\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `Throughout our session, periodically ask me:\n`;
      prompt += `• "On a scale of 1-5, how confident are you about this?"\n`;
      prompt += `• "What's still unclear or confusing?"\n`;
      prompt += `• "How would you explain this to someone else?"\n`;
      prompt += `• "What questions should you be asking yourself?"\n`;
      prompt += `\nThis helps me develop self-awareness of my learning.\n\n`;
    }

    customSections.filter(s => s.enabled).forEach(section => {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `${section.title}\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `${section.content}\n`;
      prompt += `\n`;
    });

    if (template.intensity !== 'minimal') {
      if (block.type === 'review') {
        prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        prompt += `🔄 REVIEW SESSION STRATEGY\n`;
        prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        prompt += `• FIRST: "What do you remember about this topic?"\n`;
        prompt += `• Test recall BEFORE re-explaining\n`;
        prompt += `• Focus on connections between concepts\n`;
        prompt += `• End with: "What would appear on a quiz about this?"\n`;
        prompt += `• Generate self-testing questions for later\n`;
        prompt += `\n`;
      } else if (block.type === 'assignment') {
        prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        prompt += `📝 ASSIGNMENT COACHING MODE\n`;
        prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        prompt += `• NEVER solve the problem for me\n`;
        prompt += `• Ask: "What have you tried so far?"\n`;
        prompt += `• Help me break down the problem structure\n`;
        prompt += `• Guide me to identify WHERE I'm stuck (not HOW to solve it)\n`;
        prompt += `• Check my reasoning process, not just the answer\n`;
        prompt += `• If I'm truly stuck, give a small hint and let me continue\n`;
        prompt += `\n`;
      } else if (block.type === 'prep') {
        prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        prompt += `📖 PRE-LEARNING STRATEGY\n`;
        prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        prompt += `• Activate prior knowledge: "What do you already know about this?"\n`;
        prompt += `• Preview key concepts and terminology\n`;
        prompt += `• Set clear learning objectives for upcoming class\n`;
        prompt += `• Generate questions to guide learning\n`;
        prompt += `\n`;
      }
    }

    if (sections.includes('examples')) {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `💡 EXAMPLE & ANALOGY GUIDELINES\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `• Use real-world, relatable analogies\n`;
      prompt += `• Start simple, build complexity progressively\n`;
      prompt += `• Connect to things I likely already understand\n`;
      prompt += `• Show multiple perspectives on the same concept\n`;
      prompt += `• Ask ME to generate examples too\n`;
      prompt += `\n`;
    }

    prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    prompt += `⚡ SESSION START\n`;
    prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (userQuestion.trim()) {
      prompt += `MY QUESTION:\n"${userQuestion}"\n\n`;
      prompt += `Remember: Guide me to the answer through questions and hints. Don't just tell me.\n\n`;
    } else {
      prompt += `I'm ready for my ${block.duration}-minute ${block.type} session on ${block.subjectName}.\n\n`;
      prompt += `Start by assessing my current understanding before diving into explanations.\n\n`;
    }

    prompt += `Let's begin! 🚀`;

    return prompt;
  };

  const copyPrompt = async (customPrompt?: string) => {
    const prompt = customPrompt || generateStudyPrompt();
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const launchProvider = (provider: AIProvider) => {
    const config = providers.find(p => p.id === provider);
    if (!config) return;

    const prompt = generateStudyPrompt();
    const url = config.url(prompt);

    saveToHistory(provider, prompt);
    updateAnalytics(provider);
    setSelectedProvider(provider);

    window.open(url, '_blank', 'noopener,noreferrer');

    setTimeout(() => onClose(), 500);
  };

  const saveToHistory = (provider: AIProvider, prompt: string) => {
    const historyItem: PromptHistory = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      provider,
      subjectName: block.subjectName,
      sessionType: block.type,
      promptPreview: prompt.slice(0, 200) + '...',
    };
    const updated = [historyItem, ...promptHistory].slice(0, 50);
    setPromptHistory(updated);
    localStorage.setItem('orbit-ai-history', JSON.stringify(updated));
  };

  const updateAnalytics = (provider: AIProvider) => {
    const newCount = sessionCount + 1;
    setSessionCount(newCount);
    localStorage.setItem('orbit-ai-session-count', newCount.toString());
    const usage = JSON.parse(localStorage.getItem('orbit-ai-provider-usage') || '{}');
    usage[provider] = (usage[provider] || 0) + 1;
    localStorage.setItem('orbit-ai-provider-usage', JSON.stringify(usage));
    const mostUsed = Object.entries(usage).sort((a, b) => (b[1] as number) - (a[1] as number))[0];
    if (mostUsed) {
      setMostEffectiveProvider(mostUsed[0] as AIProvider);
    }
  };

  const loadUserPreferences = () => {
    try {
      const savedTemplate = localStorage.getItem('orbit-ai-template');
      if (savedTemplate) setSelectedTemplate(savedTemplate);
      const savedIntensity = localStorage.getItem('orbit-ai-intensity') as typeof promptIntensity;
      if (savedIntensity) setPromptIntensity(savedIntensity);
      const savedSections = localStorage.getItem('orbit-ai-custom-sections');
      if (savedSections) setCustomSections(JSON.parse(savedSections));
      const savedFavorites = localStorage.getItem('orbit-ai-favorites');
      if (savedFavorites) setFavoriteProviders(JSON.parse(savedFavorites));
      const savedCount = localStorage.getItem('orbit-ai-session-count');
      if (savedCount) setSessionCount(parseInt(savedCount));
      const savedBloom = localStorage.getItem('orbit-ai-bloom-level');
      if (savedBloom) setBloomLevel(savedBloom);
      const usage = JSON.parse(localStorage.getItem('orbit-ai-provider-usage') || '{}');
      const mostUsed = Object.entries(usage).sort((a, b) => (b[1] as number) - (a[1] as number))[0];
      if (mostUsed) setMostEffectiveProvider(mostUsed[0] as AIProvider);
    } catch (err) {
      console.error('Failed to load preferences:', err);
    }
  };

  const loadPromptHistory = () => {
    try {
      const saved = localStorage.getItem('orbit-ai-history');
      if (saved) setPromptHistory(JSON.parse(saved));
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  const savePreferences = () => {
    localStorage.setItem('orbit-ai-template', selectedTemplate);
    localStorage.setItem('orbit-ai-intensity', promptIntensity);
    localStorage.setItem('orbit-ai-custom-sections', JSON.stringify(customSections));
    localStorage.setItem('orbit-ai-favorites', JSON.stringify(favoriteProviders));
    localStorage.setItem('orbit-ai-bloom-level', bloomLevel);
  };

  const toggleFavorite = (provider: AIProvider) => {
    const updated = favoriteProviders.includes(provider)
      ? favoriteProviders.filter(p => p !== provider)
      : [...favoriteProviders, provider];
    setFavoriteProviders(updated);
    localStorage.setItem('orbit-ai-favorites', JSON.stringify(updated));
  };

  const exportSettings = () => {
    const settings = {
      template: selectedTemplate,
      intensity: promptIntensity,
      customSections,
      favorites: favoriteProviders,
      bloomLevel,
      history: promptHistory.slice(0, 10),
    };
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orbit-ai-settings-${Date.now()}.json`;
    a.click();
  };

  const importSettings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const settings = JSON.parse(e.target?.result as string);
        if (settings.template) setSelectedTemplate(settings.template);
        if (settings.intensity) setPromptIntensity(settings.intensity);
        if (settings.customSections) setCustomSections(settings.customSections);
        if (settings.favorites) setFavoriteProviders(settings.favorites);
        if (settings.bloomLevel) setBloomLevel(settings.bloomLevel);
        savePreferences();
      } catch (err) {
        console.error('Failed to import settings:', err);
      }
    };
    reader.readAsText(file);
  };

  const getProviderStats = () => {
    const usage = JSON.parse(localStorage.getItem('orbit-ai-provider-usage') || '{}');
    return providers.map(p => ({
      provider: p,
      count: usage[p.id] || 0,
      percentage: sessionCount > 0 ? Math.round(((usage[p.id] || 0) / sessionCount) * 100) : 0,
    })).sort((a, b) => b.count - a.count);
  };

  const recommendedProvider = getRecommendedProvider();
  const recommendedConfig = providers.find(p => p.id === recommendedProvider);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <style>{`
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          60% { opacity: 1; transform: translateY(-3px) scale(1.005); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes glow-pulse { 0%, 100% { box-shadow: 0 0 20px var(--glow-color); } 50% { box-shadow: 0 0 40px var(--glow-color); } }
        .provider-card:hover { transform: translateY(-2px); transition: transform 200ms ease; }
        .provider-card:active { transform: translateY(0) scale(0.98); }
        .tab-button { position: relative; transition: all 150ms ease; }
        .tab-button.active::after { content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, #a855f7, #3b82f6); }
        .recommended-badge { animation: glow-pulse 2s ease-in-out infinite; }
      `}</style>
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        style={{ animation: 'fade-in 150ms ease-out', willChange: 'opacity' }}
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl border border-white/10 shadow-2xl flex flex-col"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(12,12,16,0.95) 100%)',
          backdropFilter: 'blur(20px)',
          animation: 'slide-up 280ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          willChange: 'transform, opacity',
        }}
      >
        <div className="relative px-8 py-6 border-b border-white/10">
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                  <Wand2 size={20} className="text-white" />
                </div>
                Deep Focus Assist
              </h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Elite AI study companion with world-class prompt engineering
              </p>
            </div>
            <div className="flex items-center gap-2">
              {sessionCount > 0 && (
                <div className="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center gap-2">
                  <Flame size={14} className="text-purple-400" />
                  <span className="text-xs text-purple-300 font-medium">{sessionCount} sessions</span>
                </div>
              )}
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-xl bg-zinc-800/60 hover:bg-zinc-700/60 flex items-center justify-center text-zinc-400 hover:text-white transition-all"
                title="Close (ESC)"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-zinc-900/50 rounded-xl p-1">
            {[
              { id: 'launch', label: 'Launch', icon: Zap },
              { id: 'customize', label: 'Customize', icon: Edit3 },
              { id: 'history', label: 'History', icon: History },
              { id: 'templates', label: 'Analytics', icon: TrendingUp },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`tab-button flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${activeTab === tab.id
                  ? 'active bg-white/10 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                <tab.icon size={16} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'launch' && (
            <div className="p-8">
              {showProviderRecommendation && recommendedConfig && (
                <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20">
                  <div className="flex items-start gap-3">
                    <Lightbulb size={20} className="text-purple-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-sm font-semibold text-purple-200">
                          💡 Smart Recommendation
                        </h4>
                        <button
                          onClick={() => setShowProviderRecommendation(false)}
                          className="text-zinc-500 hover:text-white"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <p className="text-xs text-zinc-300 mb-2">
                        Based on your <span className="text-purple-300 font-medium">{block.type}</span> session and subject matter, we recommend{' '}
                        <span className="font-bold" style={{ color: recommendedConfig.color }}>{recommendedConfig.name}</span>
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {recommendedConfig.bestFor.slice(0, 3).map((strength, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300"
                          >
                            {strength}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="mb-6 p-6 rounded-2xl bg-gradient-to-b from-white/[0.02] to-transparent border border-white/5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 text-sm">Subject</span>
                    <span className="text-white font-semibold">{block.subjectName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 text-sm">Session Type</span>
                    <span className="text-purple-300 font-medium capitalize">{block.type}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 text-sm">Duration</span>
                    <span className="text-blue-300 font-medium">{block.duration} minutes</span>
                  </div>
                  {subjectIntelligence?.readiness !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500 text-sm">Readiness</span>
                      <span className={`font-bold ${subjectIntelligence.readiness < 35 ? 'text-red-400' :
                        subjectIntelligence.readiness < 70 ? 'text-amber-400' :
                          'text-green-400'
                        }`}>
                        {subjectIntelligence.readiness}%
                      </span>
                    </div>
                  )}
                  {subjectIntelligence?.weakTopics && subjectIntelligence.weakTopics.length > 0 && (
                    <div className="pt-2 border-t border-white/5">
                      <span className="text-zinc-500 text-xs mb-2 block">Priority Focus:</span>
                      <div className="flex flex-wrap gap-2">
                        {subjectIntelligence.weakTopics.map((topic, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-zinc-400 mb-2 flex items-center gap-2">
                  <Target size={14} />
                  Learning Objective (Optional)
                </label>
                <input
                  type="text"
                  value={learningObjective}
                  onChange={(e) => setLearningObjective(e.target.value)}
                  placeholder="e.g., Be able to solve quadratic equations independently"
                  className="w-full px-4 py-2.5 rounded-xl bg-zinc-900/60 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all text-sm"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-zinc-400 mb-2 flex items-center gap-2">
                  <MessageSquare size={14} />
                  Specific Question or Problem
                </label>
                <textarea
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder="e.g., Explain integration by parts with a real-world example..."
                  className="w-full px-4 py-3 rounded-xl bg-zinc-900/60 border border-zinc-700 text-white placeholder:text-zinc-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all text-sm resize-none"
                  rows={3}
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
                  <Brain size={14} />
                  Cognitive Depth Target
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'remember', label: 'Remember', desc: 'Recall facts', icon: '📝' },
                    { id: 'understand', label: 'Understand', desc: 'Explain concepts', icon: '💡' },
                    { id: 'apply', label: 'Apply', desc: 'Use in new situations', icon: '🔧' },
                    { id: 'analyze', label: 'Analyze', desc: 'Break down & examine', icon: '🔍' },
                    { id: 'evaluate', label: 'Evaluate', desc: 'Make judgments', icon: '⚖️' },
                    { id: 'create', label: 'Create', desc: 'Produce new work', icon: '🎨' },
                  ].map((level) => (
                    <button
                      key={level.id}
                      onClick={() => {
                        setBloomLevel(level.id);
                        savePreferences();
                      }}
                      className={`p-3 rounded-lg border text-left transition-all ${bloomLevel === level.id
                        ? 'bg-purple-500/20 border-purple-500/40 text-purple-200'
                        : 'bg-zinc-900/40 border-zinc-700 hover:border-zinc-600 text-zinc-300'
                        }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{level.icon}</span>
                        <span className="text-xs font-semibold">{level.label}</span>
                      </div>
                      <div className="text-[10px] text-zinc-500">{level.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-semibold text-sm uppercase tracking-wide flex items-center gap-2">
                    <Sparkles size={14} />
                    Select Your AI Coach
                  </h3>
                  {mostEffectiveProvider && (
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <Star size={12} className="text-amber-400" />
                      <span>Most used: {providers.find(p => p.id === mostEffectiveProvider)?.name}</span>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {providers.map((provider) => {
                    const isFavorite = favoriteProviders.includes(provider.id);
                    const isRecommended = provider.id === recommendedProvider;
                    return (
                      <div key={provider.id} className="relative">
                        {isRecommended && (
                          <div className="absolute -top-2 -right-2 z-10 recommended-badge">
                            <div className="px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 text-white text-[10px] font-bold flex items-center gap-1 shadow-lg">
                              <Sparkles size={10} />
                              RECOMMENDED
                            </div>
                          </div>
                        )}
                        <button
                          onClick={() => launchProvider(provider.id)}
                          className={`provider-card group relative w-full p-5 rounded-2xl border transition-all ${isRecommended ? 'ring-2 ring-purple-500/50' : ''
                            }`}
                          style={{
                            background: `linear-gradient(135deg, ${provider.gradient.replace('from-', 'rgba(').replace('/20', ', 0.1)').replace(' to-', ') 0%, rgba(').replace('/20', ', 0.05)')}) 100%)`,
                            borderColor: selectedProvider === provider.id
                              ? provider.color
                              : isRecommended
                                ? provider.color + '40'
                                : 'rgba(255,255,255,0.08)',
                          }}
                        >
                          <div className="flex items-start gap-4">
                            <div
                              className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
                              style={{
                                background: `linear-gradient(135deg, ${provider.color}20, ${provider.color}10)`,
                                color: provider.color,
                              }}
                            >
                              {provider.icon}
                            </div>
                            <div className="flex-1 text-left">
                              <div className="font-semibold text-white mb-1 flex items-center gap-2">
                                {provider.name}
                                {isFavorite && <Star size={12} className="text-amber-400 fill-amber-400" />}
                              </div>
                              <div className="text-xs text-zinc-400 mb-2">
                                {provider.supportsAutoFill ? '✨ Auto-fill supported' : '📋 Copy & paste'}
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {provider.strengths.slice(0, 2).map((strength, idx) => (
                                  <span
                                    key={idx}
                                    className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-zinc-300"
                                  >
                                    {strength}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(provider.id);
                            }}
                            className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-zinc-900/60 hover:bg-zinc-800/80 flex items-center justify-center transition-all"
                          >
                            <Star
                              size={12}
                              className={isFavorite ? 'text-amber-400 fill-amber-400' : 'text-zinc-500'}
                            />
                          </button>
                        </button>
                        <div className="mt-2 p-2 rounded-lg bg-zinc-900/40 border border-zinc-800">
                          <div className="text-[10px] text-zinc-500 mb-1 font-medium">Best for:</div>
                          <div className="flex flex-wrap gap-1">
                            {provider.bestFor.map((use, idx) => (
                              <span
                                key={idx}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-400"
                              >
                                {use}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <button
                    onClick={() => copyPrompt()}
                    className="flex-1 h-12 rounded-xl bg-zinc-900/60 border border-zinc-700 hover:bg-zinc-800/60 hover:border-zinc-600 flex items-center justify-center gap-2 text-zinc-300 hover:text-white transition-all group"
                  >
                    {copiedPrompt ? (
                      <>
                        <Check size={16} className="text-green-400" />
                        <span className="text-green-400 font-medium">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={16} className="group-hover:scale-110 transition-transform" />
                        <span>Copy Prompt</span>
                        <kbd className="hidden sm:inline px-2 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-500">⌘C</kbd>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setShowPromptPreview(!showPromptPreview)}
                    className="px-6 h-12 rounded-xl bg-zinc-900/60 border border-zinc-700 hover:bg-zinc-800/60 flex items-center gap-2 text-zinc-300 hover:text-white transition-all"
                  >
                    {showPromptPreview ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    <span className="hidden sm:inline">Preview</span>
                    <kbd className="hidden sm:inline px-2 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-500">⌘P</kbd>
                  </button>
                </div>
                {showPromptPreview && (
                  <div className="p-6 rounded-xl bg-zinc-900/40 border border-zinc-700">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-zinc-500 font-medium">Generated Prompt Preview</span>
                      <span className="text-xs text-zinc-600">
                        {generateStudyPrompt().length} characters
                      </span>
                    </div>
                    <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto">
                      {generateStudyPrompt()}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
          {activeTab === 'customize' && (
            <div className="p-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
                    <Bookmark size={14} />
                    Prompt Template
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {templates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => {
                          setSelectedTemplate(template.id);
                          setPromptIntensity(template.intensity);
                          if (template.bloomLevel) setBloomLevel(template.bloomLevel);
                          savePreferences();
                        }}
                        className={`p-4 rounded-xl border text-left transition-all ${selectedTemplate === template.id
                          ? 'bg-purple-500/10 border-purple-500/30'
                          : 'bg-zinc-900/40 border-zinc-700 hover:border-zinc-600'
                          }`}
                      >
                        <div className="font-medium text-white mb-1">{template.name}</div>
                        <div className="text-xs text-zinc-400 mb-2">{template.description}</div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${template.intensity === 'minimal' ? 'bg-blue-500/20 text-blue-400' :
                            template.intensity === 'balanced' ? 'bg-purple-500/20 text-purple-400' :
                              'bg-amber-500/20 text-amber-400'
                            }`}>
                            {template.intensity}
                          </span>
                          {template.bloomLevel && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-green-500/20 text-green-400">
                              {template.bloomLevel}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                      <Edit3 size={14} />
                      Custom Sections
                    </label>
                    <button
                      onClick={() => {
                        const newSection: CustomSection = {
                          id: Date.now().toString(),
                          title: '📌 CUSTOM SECTION',
                          content: 'Add your custom instructions here...',
                          enabled: true,
                        };
                        const updated = [...customSections, newSection];
                        setCustomSections(updated);
                        localStorage.setItem('orbit-ai-custom-sections', JSON.stringify(updated));
                      }}
                      className="px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 text-xs font-medium hover:bg-purple-500/30 transition-all"
                    >
                      + Add Section
                    </button>
                  </div>
                  <div className="space-y-3">
                    {customSections.map((section, idx) => (
                      <div key={section.id} className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-700">
                        <div className="flex items-center gap-3 mb-3">
                          <input
                            type="checkbox"
                            checked={section.enabled}
                            onChange={(e) => {
                              const updated = [...customSections];
                              updated[idx].enabled = e.target.checked;
                              setCustomSections(updated);
                              savePreferences();
                            }}
                            className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-purple-500"
                          />
                          <input
                            type="text"
                            value={section.title}
                            onChange={(e) => {
                              const updated = [...customSections];
                              updated[idx].title = e.target.value;
                              setCustomSections(updated);
                            }}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700 text-white text-sm focus:outline-none focus:border-purple-500/50"
                          />
                          <button
                            onClick={() => {
                              const updated = customSections.filter((_, i) => i !== idx);
                              setCustomSections(updated);
                              localStorage.setItem('orbit-ai-custom-sections', JSON.stringify(updated));
                            }}
                            className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 flex items-center justify-center transition-all"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <textarea
                          value={section.content}
                          onChange={(e) => {
                            const updated = [...customSections];
                            updated[idx].content = e.target.value;
                            setCustomSections(updated);
                          }}
                          className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700 text-white text-sm focus:outline-none focus:border-purple-500/50 resize-none"
                          rows={3}
                        />
                      </div>
                    ))}
                    {customSections.length === 0 && (
                      <div className="text-center py-8 text-zinc-500 text-sm">
                        No custom sections yet. Add one to personalize your prompts!
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={savePreferences}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 text-white font-medium flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/20 transition-all"
                >
                  <Save size={16} />
                  <span>Save Preferences</span>
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={exportSettings}
                    className="flex-1 h-10 rounded-xl bg-zinc-900/60 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800/60 text-sm flex items-center justify-center gap-2 transition-all"
                  >
                    <Download size={14} />
                    <span>Export Settings</span>
                  </button>
                  <label className="flex-1">
                    <input
                      type="file"
                      accept=".json"
                      onChange={importSettings}
                      className="hidden"
                    />
                    <div className="h-10 rounded-xl bg-zinc-900/60 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800/60 text-sm flex items-center justify-center gap-2 transition-all cursor-pointer">
                      <Upload size={14} />
                      <span>Import Settings</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'history' && (
            <div className="p-8">
              <div className="space-y-4">
                {promptHistory.length === 0 ? (
                  <div className="text-center py-12">
                    <History size={48} className="text-zinc-700 mx-auto mb-4" />
                    <p className="text-zinc-500 text-sm">No session history yet</p>
                  </div>
                ) : (
                  <>
                    {promptHistory.map((item) => {
                      const provider = providers.find(p => p.id === item.provider);
                      return (
                        <div
                          key={item.id}
                          className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-700 hover:border-zinc-600 transition-all"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-3">
                              {provider && (
                                <div
                                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                                  style={{
                                    background: `linear-gradient(135deg, ${provider.color}20, ${provider.color}10)`,
                                    color: provider.color,
                                  }}
                                >
                                  {React.cloneElement(provider.icon as React.ReactElement<{ size?: number }>, { size: 16 })}
                                </div>
                              )}
                              <div>
                                <div className="font-medium text-white text-sm">{item.subjectName}</div>
                                <div className="text-xs text-zinc-500 capitalize">{item.sessionType}</div>
                              </div>
                            </div>
                            <div className="text-xs text-zinc-500">
                              {new Date(item.timestamp).toLocaleDateString()}
                            </div>
                          </div>
                          <p className="text-xs text-zinc-400 line-clamp-2">{item.promptPreview}</p>
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => copyPrompt(item.promptPreview)}
                              className="px-3 py-1.5 rounded-lg bg-zinc-800/60 text-zinc-300 hover:text-white text-xs flex items-center gap-2 transition-all"
                            >
                              <Copy size={12} />
                              <span>Copy</span>
                            </button>
                            <button
                              onClick={() => {
                                if (provider) launchProvider(provider.id);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 text-xs flex items-center gap-2 transition-all"
                            >
                              <RefreshCw size={12} />
                              <span>Reuse</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          )}
          {activeTab === 'templates' && (
            <div className="p-8">
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20">
                    <div className="text-2xl font-bold text-white mb-1">{sessionCount}</div>
                    <div className="text-xs text-zinc-400">Total Sessions</div>
                  </div>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
                    <div className="text-2xl font-bold text-white mb-1">{favoriteProviders.length}</div>
                    <div className="text-xs text-zinc-400">Favorites</div>
                  </div>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20">
                    <div className="text-2xl font-bold text-white mb-1">{customSections.filter(s => s.enabled).length}</div>
                    <div className="text-xs text-zinc-400">Custom Sections</div>
                  </div>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
                    <div className="text-2xl font-bold text-white mb-1">{promptHistory.length}</div>
                    <div className="text-xs text-zinc-400">History Items</div>
                  </div>
                </div>
                <div>
                  <h3 className="text-white font-semibold mb-4 text-sm flex items-center gap-2">
                    <TrendingUp size={14} />
                    Provider Usage Analytics
                  </h3>
                  <div className="space-y-3">
                    {getProviderStats().map((stat) => (
                      <div key={stat.provider.id} className="flex items-center gap-4">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{
                            background: `linear-gradient(135deg, ${stat.provider.color}20, ${stat.provider.color}10)`,
                            color: stat.provider.color,
                          }}
                        >
                          {React.cloneElement(stat.provider.icon as React.ReactElement<{ size?: number }>, { size: 20 })}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-white text-sm font-medium">{stat.provider.name}</span>
                            <span className="text-zinc-400 text-xs">{stat.count} uses ({stat.percentage}%)</span>
                          </div>
                          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${stat.percentage}%`,
                                background: `linear-gradient(90deg, ${stat.provider.color}, ${stat.provider.color}80)`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pt-4 border-t border-white/5">
                  <h3 className="text-white font-semibold mb-4 text-sm">Quick Actions</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        if (confirm('Clear all session history?')) {
                          localStorage.removeItem('orbit-ai-history');
                          setPromptHistory([]);
                        }
                      }}
                      className="px-4 py-3 rounded-xl bg-zinc-900/60 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800/60 text-sm flex items-center gap-2 transition-all"
                    >
                      <X size={14} />
                      <span>Clear History</span>
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Reset all settings to default?')) {
                          localStorage.removeItem('orbit-ai-template');
                          localStorage.removeItem('orbit-ai-intensity');
                          localStorage.removeItem('orbit-ai-custom-sections');
                          localStorage.removeItem('orbit-ai-favorites');
                          localStorage.removeItem('orbit-ai-bloom-level');
                          setSelectedTemplate('balanced');
                          setPromptIntensity('balanced');
                          setCustomSections([]);
                          setFavoriteProviders([]);
                          setBloomLevel('understand');
                        }
                      }}
                      className="px-4 py-3 rounded-xl bg-zinc-900/60 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800/60 text-sm flex items-center gap-2 transition-all"
                    >
                      <RefreshCw size={14} />
                      <span>Reset Settings</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="px-8 py-4 bg-gradient-to-b from-transparent to-black/20 border-t border-white/5">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span>World-class prompts • Zero API costs • Privacy-first</span>
            </div>
            <div className="hidden sm:flex items-center gap-4">
              <span>ESC to close</span>
              <span>⌘C to copy</span>
              <span>⌘P to preview</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};