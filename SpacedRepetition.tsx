import React, { useState, useEffect } from 'react';
import { Brain, Calendar, TrendingUp, CheckCircle, AlertCircle, Clock, Target } from 'lucide-react';
import { StudyTopic } from './types';
import { db } from './db';
import { useLiveQuery } from 'dexie-react-hooks';

// Comprehension Rating Modal
export const ComprehensionRatingModal = ({
  isOpen,
  topicName,
  onRate,
  onSkip
}: {
  isOpen: boolean;
  topicName: string;
  onRate: (rating: 1 | 2 | 3, selectedTopic?: string) => void;
  onSkip: () => void;
}) => {
  const [selectedTopic, setSelectedTopic] = useState(topicName || '');

  // Sync with prop when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedTopic(topicName || '');
    }
  }, [isOpen, topicName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6">
      <div className="bg-zinc-900 rounded-3xl p-8 max-w-md w-full space-y-6 border border-white/10 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="text-center">
          <div className="w-16 h-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-500/30">
            <Brain size={32} className="text-indigo-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">How well did you understand?</h2>
          <p className="text-zinc-400 text-sm">This helps schedule your next review</p>
        </div>

        {/* Topic Name Input */}
        <div>
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">
            What did you study?
          </label>
          <input
            value={selectedTopic}
            onChange={(e) => setSelectedTopic(e.target.value)}
            placeholder="e.g., Pointers, Linked Lists, Derivatives"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 outline-none focus:border-indigo-500 transition-all"
            autoFocus
          />
          <p className="text-xs text-zinc-600 mt-2">
            💡 Be specific - this helps track individual concepts
          </p>
        </div>

        {/* Rating Buttons */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => selectedTopic.trim() && onRate(1, selectedTopic)}
            disabled={!selectedTopic.trim()}
            className="group p-6 rounded-2xl border-2 border-red-500/30 bg-red-500/10 hover:bg-red-500/20 hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <div className="text-4xl mb-2">😓</div>
            <div className="text-sm font-bold text-red-300">Hard</div>
            <div className="text-xs text-red-400/60 mt-1">Review soon</div>
          </button>

          <button
            onClick={() => selectedTopic.trim() && onRate(2, selectedTopic)}
            disabled={!selectedTopic.trim()}
            className="group p-6 rounded-2xl border-2 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <div className="text-4xl mb-2">😐</div>
            <div className="text-sm font-bold text-amber-300">Good</div>
            <div className="text-xs text-amber-400/60 mt-1">Normal pace</div>
          </button>

          <button
            onClick={() => selectedTopic.trim() && onRate(3, selectedTopic)}
            disabled={!selectedTopic.trim()}
            className="group p-6 rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <div className="text-4xl mb-2">😃</div>
            <div className="text-sm font-bold text-emerald-300">Easy</div>
            <div className="text-xs text-emerald-400/60 mt-1">Review later</div>
          </button>
        </div>

        <button
          onClick={onSkip}
          className="w-full py-3 text-zinc-500 hover:text-white transition-all text-sm"
        >
          Skip (no tracking)
        </button>
      </div>
    </div>
  );
};

// Upcoming Reviews Widget
export const UpcomingReviewsWidget = () => {
  const today = new Date().toISOString().split('T')[0];

  // Fetch topics with subject names
  const topics = useLiveQuery(async () => {
    const allTopics = await db.topics.toArray();
    const withSubjects = await Promise.all(
      allTopics.map(async topic => {
        const subject = await db.subjects.get(topic.subjectId);
        return { ...topic, subjectName: subject?.name || 'Unknown' };
      })
    );
    return withSubjects;
  }) || [];

  const dueToday = topics.filter(t => t.nextReview <= today);
  const upcoming = topics.filter(t => t.nextReview > today).slice(0, 5);

  if (topics.length === 0) {
    return (
      <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-purple-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-purple-400">
              Reviews Due
            </span>
          </div>
          <span className="text-3xl font-mono font-bold text-purple-200">0</span>
        </div>
        <div className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
          <div className="text-xs text-zinc-500 text-center">
            No topics tracked yet. Complete a review session to start tracking.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-purple-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-purple-400">
            Reviews Due
          </span>
        </div>
        <span className="text-3xl font-mono font-bold text-purple-200">
          {dueToday.length}
        </span>
      </div>

      {dueToday.length > 0 ? (
        <div className="space-y-2 mb-4">
          {dueToday.slice(0, 3).map(topic => (
            <div
              key={topic.id}
              className="p-3 bg-purple-500/10 rounded-xl border border-purple-500/20 animate-in slide-in-from-left-2 fade-in duration-300"
              style={{ animationDelay: `${dueToday.indexOf(topic) * 50}ms` }}
            >
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle size={12} className="text-purple-400" />
                <span className="text-xs font-bold text-purple-300">
                  {topic.subjectName}
                </span>
              </div>
              <div className="text-sm text-white font-medium">{topic.name}</div>
              <div className="text-xs text-purple-400/60 mt-1">
                Review #{topic.reviewCount} • Ease: {topic.easeFactor.toFixed(1)}
              </div>
            </div>
          ))}
          {dueToday.length > 3 && (
            <div className="text-xs text-zinc-500 text-center">
              +{dueToday.length - 3} more due today
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={14} className="text-emerald-400" />
            <span className="text-xs font-bold text-emerald-300">All caught up!</span>
          </div>
          <div className="text-xs text-emerald-400/60">
            No reviews due today
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div>
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
            Coming Soon
          </div>
          <div className="space-y-1">
            {upcoming.map((topic, i) => {
              const daysUntil = Math.ceil(
                (new Date(topic.nextReview).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)
              );
              return (
                <div
                  key={topic.id}
                  className="flex justify-between text-xs p-2 hover:bg-white/5 rounded-lg transition-all animate-in slide-in-from-left-2 fade-in duration-300"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <span className="text-zinc-400 truncate">{topic.name}</span>
                  <span className="text-zinc-600 ml-2 whitespace-nowrap">
                    {daysUntil}d
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// Topic Mastery Card (for Stats page)
export const TopicMasteryCard = ({ topic }: { topic: StudyTopic & { subjectName?: string } }) => {
  const avgComprehension = topic.comprehensionHistory.length > 0
    ? topic.comprehensionHistory.reduce((a, b) => a + b, 0) / topic.comprehensionHistory.length
    : 0;

  const masteryLevel = avgComprehension >= 2.5 ? 'Mastered' :
    avgComprehension >= 2.0 ? 'Proficient' :
      avgComprehension >= 1.5 ? 'Learning' :
        'Struggling';

  const masteryColor = avgComprehension >= 2.5 ? 'emerald' :
    avgComprehension >= 2.0 ? 'cyan' :
      avgComprehension >= 1.5 ? 'amber' :
        'red';

  return (
    <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/10 hover:border-white/20 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-white truncate">{topic.name}</h4>
          <p className="text-xs text-zinc-500">{topic.subjectName || 'Unknown'}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full bg-${masteryColor}-500/20 text-${masteryColor}-400 border border-${masteryColor}-500/30 whitespace-nowrap`}>
          {masteryLevel}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-zinc-500 mb-1">Reviews</div>
          <div className="font-bold text-white">{topic.reviewCount}</div>
        </div>
        <div>
          <div className="text-zinc-500 mb-1">Ease</div>
          <div className="font-bold text-white">{topic.easeFactor.toFixed(1)}</div>
        </div>
        <div>
          <div className="text-zinc-500 mb-1">Next</div>
          <div className="font-bold text-white">
            {Math.ceil(
              (new Date(topic.nextReview).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            )}d
          </div>
        </div>
      </div>

      {/* Comprehension History */}
      <div className="mt-3 flex gap-1">
        {topic.comprehensionHistory.slice(-10).map((rating, i) => (
          <div
            key={i}
            className={`flex-1 h-6 rounded ${rating === 3 ? 'bg-emerald-500' :
                rating === 2 ? 'bg-amber-500' :
                  'bg-red-500'
              }`}
            style={{ opacity: Math.max(0.3, 1 - (i * 0.1)) }}
            title={`Review ${i + 1}: ${rating === 3 ? 'Easy' : rating === 2 ? 'Good' : 'Hard'}`}
          />
        ))}
      </div>
    </div>
  );
};
