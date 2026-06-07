#!/usr/bin/env node
import 'dotenv/config';
import { generateQuestionSet, judgeAnswer, finalizeMock } from '../src/services/gemini-mock.js';
import { geminiReview } from '../src/services/gemini-review.js';

console.log('🚀 Testing Gemini Integration...\n');

// Check environment
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not found in environment variables');
  console.log('Please create a .env file with your Gemini API key');
  process.exit(1);
}

console.log('✅ GEMINI_API_KEY found');

async function testMockServices() {
  console.log('\n📋 Testing Mock Interview Services...');
  
  try {
    // Test question generation
    console.log('  Testing question generation...');
    const questions = await generateQuestionSet({
      role: 'Software Engineer',
      difficulty: 'medium',
      numQuestions: 3
    });
    console.log(`  ✅ Generated ${questions.questions.length} questions`);
    
    // Test answer judging
    console.log('  Testing answer judging...');
    const judgment = await judgeAnswer({
      role: 'Software Engineer',
      difficulty: 'medium',
      question: questions.questions[0].text,
      answer: 'I led a project where I implemented a microservices architecture using Node.js and Docker. The challenge was coordinating between multiple teams and ensuring data consistency across services.'
    });
    console.log(`  ✅ Answer judged with score: ${judgment.scoreContent}/100`);
    
    // Test finalization
    console.log('  Testing mock finalization...');
    const final = await finalizeMock({
      role: 'Software Engineer',
      difficulty: 'medium',
      items: [{
        question: questions.questions[0].text,
        scoreContent: judgment.scoreContent,
        rubric: judgment.rubric,
        notes: judgment.notes
      }]
    });
    console.log(`  ✅ Mock finalized with overall score: ${final.overall}/100, signal: ${final.signal}`);
    
  } catch (error) {
    console.error('  ❌ Mock services test failed:', error.message);
  }
}

async function testReviewService() {
  console.log('\n🎯 Testing Review Service...');
  
  try {
    const review = await geminiReview({
      transcript: 'Hello, my name is John and I am applying for the software engineer position. I have been working with JavaScript and Node.js for about three years. In my previous role, I worked on building REST APIs and managing databases.',
      minutesSpoken: 2,
      avgWpm: 150,
      fillersPerMin: 2,
      speakingRatioPct: 85,
      avgLoudnessDb: -20
    });
    
    console.log(`  ✅ Review generated with ${review.strengths.length} strengths and ${review.issues.length} issues`);
    console.log(`  📝 Summary: ${review.summary.substring(0, 100)}...`);
    
  } catch (error) {
    console.error('  ❌ Review service test failed:', error.message);
  }
}

async function main() {
  await testMockServices();
  await testReviewService();
  console.log('\n🎉 Integration test completed!');
}

main().catch(console.error);