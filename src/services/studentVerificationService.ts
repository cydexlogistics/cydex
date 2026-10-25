// Phase 2: Student Verification Service
import { supabase } from "@/integrations/supabase/client";
import { nigerianDate } from '@/lib/nigerianTime';

export interface StudentSubscription {
  id: string;
  student_id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  payment_reference: string | null;
  created_at: string;
}

// UI student email domains
const UI_EMAIL_DOMAINS = [
  '@ui.edu.ng',
  '@student.ui.edu.ng',
  '@mail.ui.edu.ng'
];

export const isUIStudentEmail = (email: string): boolean => {
  return UI_EMAIL_DOMAINS.some(domain => email.toLowerCase().endsWith(domain.toLowerCase()));
};

export const checkActiveSubscription = async (userId: string): Promise<StudentSubscription | null> => {
  const { data, error } = await supabase
    .from('student_subscriptions')
    .select('*')
    .eq('student_id', userId)
    .eq('status', 'active')
    .gte('end_date', nigerianDate())
    .single();

  if (error) {
    console.log('No active subscription found:', error.message);
    return null;
  }

  return data;
};

export const createStudentSubscription = async (
  userId: string,
  paymentReference: string,
  durationMonths: number = 1
): Promise<StudentSubscription | null> => {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + durationMonths);

  const { data, error } = await supabase
    .from('student_subscriptions')
    .insert({
      student_id: userId,
      status: 'active',
      start_date: nigerianDate(startDate),
      end_date: nigerianDate(endDate),
      payment_reference: paymentReference
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create student subscription:', error);
    return null;
  }

  return data;
};

export const getStudentEligibility = async (email: string, userId?: string) => {
  const isStudentEmail = isUIStudentEmail(email);
  let hasActiveSubscription = false;
  let subscription: StudentSubscription | null = null;

  if (isStudentEmail && userId) {
    subscription = await checkActiveSubscription(userId);
    hasActiveSubscription = subscription !== null;
  }

  return {
    isEligibleForDiscount: isStudentEmail,
    hasActiveSubscription,
    subscription,
    eligibleForSubscription: isStudentEmail && !hasActiveSubscription
  };
};