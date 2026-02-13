// utils/validation.ts
// Copy this file directly to your project

/**
 * Validates date string format (YYYY-MM-DD) and ensures it's a real date
 */
export function isValidDateString(date: string): boolean {
  // Check format
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(date)) {
    return false;
  }
  
  // Check if it's a real date
  const d = new Date(date + 'T00:00:00Z');
  if (isNaN(d.getTime())) {
    return false;
  }
  
  // Verify the date matches (catches invalid dates like 2024-02-30)
  const [year, month, day] = date.split('-').map(Number);
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * Validates and parses date string
 * @throws Error if date is invalid
 */
export function parseDateString(date: string): Date {
  if (!isValidDateString(date)) {
    throw new Error(`Invalid date format: ${date}. Expected YYYY-MM-DD with valid values`);
  }
  
  return new Date(date + 'T00:00:00Z');
}

/**
 * Safely calculates days between two dates
 * @throws Error if either date is invalid
 */
export function daysBetween(dateA: string, dateB: string): number {
  const a = parseDateString(dateA);
  const b = parseDateString(dateB);
  
  const diff = a.getTime() - b.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Validates subject name
 * @returns Error message if invalid, null if valid
 */
export function validateSubjectName(name: string): string | null {
  if (!name || name.trim().length === 0) {
    return 'Subject name cannot be empty';
  }
  
  const trimmed = name.trim();
  
  if (trimmed.length < 2) {
    return 'Subject name must be at least 2 characters';
  }
  
  if (trimmed.length > 100) {
    return 'Subject name too long (max 100 characters)';
  }
  
  // Allow letters, numbers, spaces, and common punctuation
  if (!/^[a-zA-Z0-9\s\-&().,/]+$/.test(trimmed)) {
    return 'Subject name contains invalid characters';
  }
  
  return null;
}

/**
 * Validates subject code (typically uppercase like "CS101")
 * @returns Error message if invalid, null if valid
 */
export function validateSubjectCode(code: string): string | null {
  if (!code || code.trim().length === 0) {
    return 'Subject code cannot be empty';
  }
  
  const trimmed = code.trim().toUpperCase();
  
  if (trimmed.length < 2) {
    return 'Subject code must be at least 2 characters';
  }
  
  if (trimmed.length > 20) {
    return 'Subject code too long (max 20 characters)';
  }
  
  // Allow uppercase letters, numbers, hyphens
  if (!/^[A-Z0-9\-]+$/.test(trimmed)) {
    return 'Subject code must be uppercase letters, numbers, or hyphens';
  }
  
  return null;
}

/**
 * Validates duration (in minutes)
 * @returns Error message if invalid, null if valid
 */
export function validateDuration(duration: number): string | null {
  if (!Number.isFinite(duration)) {
    return 'Duration must be a valid number';
  }
  
  if (!Number.isInteger(duration)) {
    return 'Duration must be a whole number';
  }
  
  if (duration < 5) {
    return 'Duration must be at least 5 minutes';
  }
  
  if (duration > 480) {
    return 'Duration cannot exceed 8 hours (480 minutes)';
  }
  
  return null;
}

/**
 * Validates credits (typically 1-6)
 * @returns Error message if invalid, null if valid
 */
export function validateCredits(credits: number): string | null {
  if (!Number.isFinite(credits)) {
    return 'Credits must be a valid number';
  }
  
  if (!Number.isInteger(credits)) {
    return 'Credits must be a whole number';
  }
  
  if (credits < 0) {
    return 'Credits cannot be negative';
  }
  
  if (credits > 10) {
    return 'Credits seems too high (max 10)';
  }
  
  return null;
}

/**
 * Validates difficulty rating (1-5)
 * @returns Error message if invalid, null if valid
 */
export function validateDifficulty(difficulty: number): string | null {
  if (!Number.isFinite(difficulty)) {
    return 'Difficulty must be a valid number';
  }
  
  if (!Number.isInteger(difficulty)) {
    return 'Difficulty must be a whole number';
  }
  
  if (difficulty < 1 || difficulty > 5) {
    return 'Difficulty must be between 1 and 5';
  }
  
  return null;
}

/**
 * Sanitizes user input to prevent XSS and limit length
 * Removes potential HTML tags and limits length
 */
export function sanitizeInput(input: string, maxLength: number = 500): string {
  if (!input) return '';
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove angle brackets (basic XSS prevention)
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers like onclick=
    .substring(0, maxLength);
}

/**
 * Validates email format (basic check)
 * @returns Error message if invalid, null if valid
 */
export function validateEmail(email: string): string | null {
  if (!email || email.trim().length === 0) {
    return 'Email cannot be empty';
  }
  
  const trimmed = email.trim();
  
  // Basic email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(trimmed)) {
    return 'Invalid email format';
  }
  
  if (trimmed.length > 100) {
    return 'Email too long';
  }
  
  return null;
}

/**
 * Validates URL format
 * @returns Error message if invalid, null if valid
 */
export function validateURL(url: string): string | null {
  if (!url || url.trim().length === 0) {
    return 'URL cannot be empty';
  }
  
  try {
    const parsed = new URL(url);
    
    // Only allow http and https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return 'URL must use http or https protocol';
    }
    
    return null;
  } catch {
    return 'Invalid URL format';
  }
}

/**
 * Validates assignment title
 * @returns Error message if invalid, null if valid
 */
export function validateAssignmentTitle(title: string): string | null {
  if (!title || title.trim().length === 0) {
    return 'Assignment title cannot be empty';
  }
  
  const trimmed = title.trim();
  
  if (trimmed.length < 3) {
    return 'Assignment title must be at least 3 characters';
  }
  
  if (trimmed.length > 200) {
    return 'Assignment title too long (max 200 characters)';
  }
  
  return null;
}

/**
 * Validates project name
 * @returns Error message if invalid, null if valid
 */
export function validateProjectName(name: string): string | null {
  if (!name || name.trim().length === 0) {
    return 'Project name cannot be empty';
  }
  
  const trimmed = name.trim();
  
  if (trimmed.length < 3) {
    return 'Project name must be at least 3 characters';
  }
  
  if (trimmed.length > 150) {
    return 'Project name too long (max 150 characters)';
  }
  
  return null;
}

/**
 * Validates progression percentage (0-100)
 * @returns Error message if invalid, null if valid
 */
export function validateProgression(progression: number): string | null {
  if (!Number.isFinite(progression)) {
    return 'Progression must be a valid number';
  }
  
  if (progression < 0 || progression > 100) {
    return 'Progression must be between 0 and 100';
  }
  
  return null;
}

/**
 * Validates semester date range
 * @returns Error message if invalid, null if valid
 */
export function validateSemesterDates(startDate: string, endDate: string): string | null {
  // Validate individual dates
  if (!isValidDateString(startDate)) {
    return 'Invalid start date';
  }
  
  if (!isValidDateString(endDate)) {
    return 'Invalid end date';
  }
  
  // Check that end is after start
  try {
    const days = daysBetween(endDate, startDate);
    if (days < 1) {
      return 'End date must be after start date';
    }
    
    if (days > 365) {
      return 'Semester duration seems too long (max 1 year)';
    }
  } catch (error) {
    return 'Invalid date range';
  }
  
  return null;
}

/**
 * Validates assignment due date (should be in the future)
 * @returns Error message if invalid, null if valid
 */
export function validateDueDate(dueDate: string, allowPast: boolean = false): string | null {
  if (!isValidDateString(dueDate)) {
    return 'Invalid due date';
  }
  
  if (!allowPast) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const days = daysBetween(dueDate, today);
      
      if (days < 0) {
        return 'Due date is in the past';
      }
    } catch (error) {
      return 'Invalid due date';
    }
  }
  
  return null;
}

/**
 * Type guard to check if value is a valid mood
 */
export function isValidMood(mood: string): mood is 'low' | 'normal' | 'high' {
  return ['low', 'normal', 'high'].includes(mood);
}

/**
 * Type guard to check if value is a valid day type
 */
export function isValidDayType(dayType: string): dayType is 'normal' | 'isa' | 'esa' {
  return ['normal', 'isa', 'esa'].includes(dayType);
}

/**
 * Type guard to check if value is a valid block type
 */
export function isValidBlockType(
  type: string
): type is 'review' | 'project' | 'prep' | 'recovery' | 'assignment' {
  return ['review', 'project', 'prep', 'recovery', 'assignment'].includes(type);
}

/**
 * Validates comprehension rating (1-3)
 */
export function validateComprehensionRating(rating: number): rating is 1 | 2 | 3 {
  return [1, 2, 3].includes(rating);
}

/**
 * Validates quality rating (1-5)
 */
export function validateQualityRating(rating: number): rating is 1 | 2 | 3 | 4 | 5 {
  return [1, 2, 3, 4, 5].includes(rating);
}

/**
 * Comprehensive validation for Subject object
 * @returns Array of error messages (empty if valid)
 */
export function validateSubject(subject: {
  name: string;
  code: string;
  credits: number;
  difficulty: number;
}): string[] {
  const errors: string[] = [];
  
  const nameError = validateSubjectName(subject.name);
  if (nameError) errors.push(nameError);
  
  const codeError = validateSubjectCode(subject.code);
  if (codeError) errors.push(codeError);
  
  const creditsError = validateCredits(subject.credits);
  if (creditsError) errors.push(creditsError);
  
  const difficultyError = validateDifficulty(subject.difficulty);
  if (difficultyError) errors.push(difficultyError);
  
  return errors;
}

/**
 * Safe number parsing with validation
 * @returns Parsed number or null if invalid
 */
export function parseNumber(value: string | number, options: {
  min?: number;
  max?: number;
  integer?: boolean;
} = {}): number | null {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  if (!Number.isFinite(num)) {
    return null;
  }
  
  if (options.integer && !Number.isInteger(num)) {
    return null;
  }
  
  if (options.min !== undefined && num < options.min) {
    return null;
  }
  
  if (options.max !== undefined && num > options.max) {
    return null;
  }
  
  return num;
}

/**
 * Validates and parses time in HH:MM format
 * @returns { hours, minutes } or null if invalid
 */
export function parseTime(time: string): { hours: number; minutes: number } | null {
  const regex = /^(\d{1,2}):(\d{2})$/;
  const match = time.match(regex);
  
  if (!match) {
    return null;
  }
  
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  
  return { hours, minutes };
}