
import React, { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Topic, Subject, ClassLevel, MCQ, Chapter, KeyConcept } from '../types';
import { getTopicDetails, getQuiz, generateSpeech, playGeneratedAudio, stopAudio } from '../services/geminiService';
import Loader from './common/Loader';
import { ChevronLeft, Copy, Check, Sparkles, BookText, ImageIcon, GitFork, Lightbulb, Library, ListOrdered, ChevronDown, ChevronRight, Volume2, Square, Loader2 } from 'lucide-react';
import Button from './common/Button';
import Card from './common/Card';
import StudyToolsModal from './StudyToolsModal';

type ViewMode = 'grid' | 'explanation' | 'visualization' | 'mindmap' | 'quiz' | 'key_concepts';

interface TopicViewProps {
  topic: Topic;
  subject: Subject;
  classLevel: ClassLevel;
  chapter: Chapter;
  onBack: () => void;
}

// Helper function for robust clipboard copying
function copyPromptToClipboard(promptText: string): void {
  let copied = false;

  try {
    const textarea = document.createElement("textarea");
    textarea.value = promptText;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.left = "-9999px";

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    // Synchronous copy – important for mobile popup rules
    copied = document.execCommand("copy");
    document.body.removeChild(textarea);
  } catch (err) {
    copied = false;
  }

  // Modern async clipboard as best-effort (non-blocking, no await)
  if (!copied && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    navigator.clipboard.writeText(promptText).catch(() => {
      // Fail silently; do not break UX
    });
  }
}

const TopicView: React.FC<TopicViewProps> = ({ topic, subject, classLevel, chapter, onBack }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [content, setContent] = useState<Record<Exclude<ViewMode, 'grid'>, any>>({ explanation: null, visualization: null, mindmap: null, quiz: null, key_concepts: null });
  const [loading, setLoading] = useState(true);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [showResults, setShowResults] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isStudyToolsModalOpen, setIsStudyToolsModalOpen] = useState(false);
  const [expandedConcept, setExpandedConcept] = useState<number | null>(null);
  
  // Audio state
  const [isReading, setIsReading] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);

  // Stop audio when unmounting or changing views
  useEffect(() => {
    return () => {
      stopAudio();
      setIsReading(false);
    };
  }, [viewMode]);

  const fetchInitialContent = useCallback(async () => {
    try {
      const data = await getTopicDetails(topic.title, subject, classLevel);
      if (data) {
        setContent(prev => ({
          ...prev,
          explanation: data.explanation,
          visualization: data.visualization,
          mindmap: data.mindmap,
          key_concepts: data.keyConcepts,
        }));
      } else {
        const errorMsg = "Sorry, I couldn't load the content. Please try again later.";
        setContent(prev => ({ ...prev, explanation: errorMsg, visualization: errorMsg, mindmap: errorMsg, key_concepts: [] }));
      }
    } catch (error: any) {
      console.error(`Failed to fetch topic details`, error);
      // Display the specific error message (e.g. Quota exceeded) if available
      const errorMsg = error.message || "An error occurred while loading the content. Please check your connection and try again.";
      setContent(prev => ({ ...prev, explanation: errorMsg, visualization: errorMsg, mindmap: errorMsg, key_concepts: [] }));
    } finally {
      setLoading(false);
    }
  }, [topic.title, subject, classLevel]);
  
  const fetchQuizContent = useCallback(async () => {
      if (content.quiz) return;
      setLoading(true);
      try {
          const data = await getQuiz(topic.title, subject, classLevel);
          setContent(prev => ({ ...prev, quiz: data || "Failed to load the quiz. Please try again." }));
      } catch (error: any) {
          console.error(`Failed to fetch quiz`, error);
          const errorMsg = error.message || "An error occurred while loading the quiz. Please try again.";
          setContent(prev => ({ ...prev, quiz: errorMsg }));
      } finally {
          setLoading(false);
      }
  }, [topic.title, subject, classLevel, content.quiz]);

  useEffect(() => {
    setViewMode('grid');
    setContent({ explanation: null, visualization: null, mindmap: null, quiz: null, key_concepts: null });
    setUserAnswers({});
    setShowResults(false);
    setLoading(true);
    setExpandedConcept(null);
    fetchInitialContent();
  }, [topic, fetchInitialContent]);

  useEffect(() => {
    if (viewMode === 'quiz' && !content.quiz) {
      fetchQuizContent();
    }
  }, [viewMode, fetchQuizContent, content.quiz]);

  const handleCopy = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
  };

  const handleAnswerChange = (questionIndex: number, answer: string) => {
    setUserAnswers(prev => ({ ...prev, [questionIndex]: answer }));
  };
  
  const calculateScore = () => {
    if (!Array.isArray(content.quiz)) return 0;
    return content.quiz?.reduce((score: number, mcq: MCQ, index: number) => {
        return userAnswers[index] === mcq.correctAnswer ? score + 1 : score;
    }, 0) || 0;
  };

  const handleOpenGemini = (promptText: string) => {
    if (!promptText) return;

    // 1. FIRST: copy prompt synchronously (or best-effort)
    copyPromptToClipboard(promptText);

    // Update UI state
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    const geminiUrl = "https://gemini.google.com/app";

    // 2. THEN: try to open Gemini in a NEW TAB
    let newWindow: Window | null = null;
    try {
      newWindow = window.open(geminiUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      // Ignore; we handle fallback below
      console.error("Popup blocked or error opening window", error);
    }

    // 3. FALLBACK: if popup is blocked, navigate the current tab
    if (!newWindow) {
      window.location.href = geminiUrl;
    }
  };

  const toggleReadAloud = async (text: string) => {
    if (isReading) {
      stopAudio();
      setIsReading(false);
      return;
    }

    if (!text) return;

    setIsAudioLoading(true);
    try {
      const audioData = await generateSpeech(text);
      if (audioData) {
        setIsAudioLoading(false);
        setIsReading(true);
        await playGeneratedAudio(audioData);
        setIsReading(false);
      } else {
        setIsAudioLoading(false);
        alert("Sorry, could not generate audio for this content.");
      }
    } catch (error) {
      console.error("Audio generation failed", error);
      setIsAudioLoading(false);
    }
  };

  const renderViewContent = () => {
    if (viewMode === 'grid') return null;
    if (loading) return <Loader />;
    
    const data = content[viewMode];
    if (!data) return <p>No content available.</p>;

    switch (viewMode) {
      case 'explanation':
        return (
          <div>
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
               <h2 className="text-xl font-bold text-text-primary">Explanation</h2>
               <Button 
                  onClick={() => toggleReadAloud(data)}
                  size="sm"
                  className={`flex items-center space-x-2 ${isReading ? 'bg-red-500 hover:bg-red-600' : 'bg-primary hover:bg-primary-hover'}`}
                  disabled={isAudioLoading}
                >
                  {isAudioLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : isReading ? (
                    <>
                      <Square size={16} className="fill-current" />
                      <span>Stop Reading</span>
                    </>
                  ) : (
                    <>
                      <Volume2 size={16} />
                      <span>Listen</span>
                    </>
                  )}
                </Button>
             </div>
            <div className="prose lg:prose-xl max-w-none">
              <ReactMarkdown>{data}</ReactMarkdown>
            </div>
          </div>
        );
      case 'mindmap':
        return (
          <div className="relative bg-background p-4 rounded-lg border border-gray-200">
            <button 
              onClick={() => handleCopy(data)}
              className="absolute top-3 right-3 p-1.5 bg-card rounded-md hover:bg-gray-100 transition-colors z-10"
              aria-label={copied ? 'Copied' : 'Copy mindmap'}
            >
              {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} className="text-text-secondary" />}
            </button>
            <div className="overflow-x-auto">
              <pre className="text-text-secondary font-mono text-sm leading-relaxed whitespace-pre">{data}</pre>
            </div>
          </div>
        );
      case 'visualization': {
        return (
          <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">AI Visualization Prompt</h3>
                <p className="text-text-secondary mb-4 text-sm">
                    This prompt describes the concept visually. It will be automatically copied to your clipboard when you click the button below.
                </p>
                <div className="bg-background p-4 rounded-lg border border-gray-200 relative group">
                    <p className="text-text-secondary font-mono text-sm leading-relaxed whitespace-pre-wrap pr-8">{data}</p>
                    <button 
                        onClick={() => handleCopy(data)}
                        className="absolute top-2 right-2 p-1.5 bg-card rounded-md hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 border border-gray-200"
                        title="Copy Prompt"
                    >
                        {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-text-secondary" />}
                    </button>
                </div>
            </div>

            <div className="pt-2">
                <Button onClick={() => handleOpenGemini(data)} className="w-full justify-center" size="lg">
                    <Sparkles size={18} className="mr-2" />
                    {copied ? "Copied! Opening Gemini..." : "Copy Prompt & Open in Gemini App"}
                </Button>
            </div>
          </div>
        );
      }
       case 'key_concepts':
        if (!Array.isArray(data) || data.length === 0) {
          return <p className="text-center text-text-secondary">No key concepts available for this topic.</p>;
        }
        return (
          <div className="space-y-3">
            {data.map((item: KeyConcept, index: number) => (
              <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedConcept(expandedConcept === index ? null : index)}
                  className="w-full flex justify-between items-center p-4 text-left font-semibold text-text-primary bg-card hover:bg-primary-light/50 transition-colors"
                  aria-expanded={expandedConcept === index}
                >
                  <span>{item.concept}</span>
                  {expandedConcept === index ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </button>
                {expandedConcept === index && (
                  <div className="p-4 bg-background border-t border-gray-200">
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown>{item.detail}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      case 'quiz':
        if (!Array.isArray(data)) {
            return <p className="text-center text-text-secondary">{typeof data === 'string' ? data : 'Something went wrong.'}</p>;
        }
        return (
          <div>
            {data.map((mcq: MCQ, index: number) => (
              <div key={index} className={`p-4 border rounded-lg mb-4 ${showResults ? (userAnswers[index] === mcq.correctAnswer ? 'border-green-500 bg-green-500/20' : 'border-red-500 bg-red-500/20') : 'border-gray-200'}`}>
                <p className="font-semibold mb-2">{index + 1}. {mcq.question}</p>
                <div className="space-y-2">
                  {mcq.options.map((option, optIndex) => (
                    <label key={optIndex} className="flex items-center space-x-3 p-2 rounded-md hover:bg-gray-100 cursor-pointer">
                      <input
                        type="radio"
                        name={`question-${index}`}
                        value={option}
                        onChange={() => handleAnswerChange(index, option)}
                        checked={userAnswers[index] === option}
                        disabled={showResults}
                        className="form-radio text-primary focus:ring-primary bg-gray-100 border-gray-300"
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
                {showResults && (
                  <div className="mt-3 p-3 bg-primary-light rounded-md text-sm">
                    <p><strong>Correct Answer:</strong> {mcq.correctAnswer}</p>
                    <p><strong>Explanation:</strong> {mcq.explanation}</p>
                  </div>
                )}
              </div>
            ))}
            {!showResults && (
                <Button onClick={() => setShowResults(true)} disabled={Object.keys(userAnswers).length !== data.length}>Submit Quiz</Button>
            )}
            {showResults && (
              <div className="mt-6 p-4 bg-primary-light rounded-lg text-center">
                <h3 className="text-xl font-bold text-primary">Your Score: {calculateScore()} / {data.length}</h3>
                <Button onClick={() => {setShowResults(false); setUserAnswers({})}} className="mt-4" variant="outline">Try Again</Button>
              </div>
            )}
          </div>
        );
    }
  };

  const features: { id: Exclude<ViewMode, 'grid'> | 'study-tools', label: string, description: string, icon: React.FC<any> }[] = [
    { id: 'explanation', label: 'Explanation', description: 'In-depth notes & examples', icon: BookText },
    { id: 'key_concepts', label: 'Key Concepts', description: 'Step-by-step breakdown', icon: ListOrdered },
    { id: 'visualization', label: 'Visualization', description: 'AI prompt for diagrams', icon: ImageIcon },
    { id: 'mindmap', label: 'Mindmap', description: 'Visual topic summary', icon: GitFork },
    { id: 'quiz', label: 'Quiz', description: 'Test your knowledge', icon: Lightbulb },
    { id: 'study-tools', label: 'Study Tools', description: 'PYQs, Flashcards & more', icon: Library },
  ];

  return (
    <div>
      <button onClick={onBack} className="flex items-center text-primary font-semibold mb-6 hover:underline">
        <ChevronLeft size={20} />
        Back to Topics
      </button>
      <h1 className="text-3xl font-bold mb-4">{topic.title}</h1>
      
      {viewMode === 'grid' ? (
        <>
            <p className="text-text-secondary mb-8">Select a feature to start learning.</p>
            {loading ? <Loader /> : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {features.map((feature) => (
                        <Card 
                            key={feature.id} 
                            onClick={() => {
                                if (feature.id === 'study-tools') {
                                    setIsStudyToolsModalOpen(true);
                                } else {
                                    setViewMode(feature.id as ViewMode);
                                }
                            }}
                            className="flex flex-col items-center justify-center p-8 text-center space-y-3"
                        >
                            <feature.icon size={40} className="text-primary" />
                            <h2 className="text-xl font-bold text-text-primary">{feature.label}</h2>
                            <p className="text-text-secondary h-10 flex items-center">{feature.description}</p>
                        </Card>
                    ))}
                </div>
            )}
        </>
      ) : (
        <div>
            <button onClick={() => setViewMode('grid')} className="flex items-center text-primary font-semibold mb-6 hover:underline">
                <ChevronLeft size={20} />
                Back to Features
            </button>
            <div className="bg-card p-6 rounded-lg shadow-md min-h-[300px]">
                {renderViewContent()}
            </div>
        </div>
      )}
      <StudyToolsModal
        isOpen={isStudyToolsModalOpen}
        onClose={() => setIsStudyToolsModalOpen(false)}
        context={{ subject, classLevel, chapter, topic }}
      />
    </div>
  );
};

export default TopicView;
