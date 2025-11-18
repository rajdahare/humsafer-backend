// List all available Gemini models for your API key
// Run: node list-models.js

const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
  console.log('🔍 Listing available Gemini models...\n');
  
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.error('❌ GOOGLE_AI_API_KEY not set!');
    process.exit(1);
  }
  
  console.log(`✅ API Key: ${apiKey.substring(0, 15)}...\n`);
  
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Try to list models using the SDK
    console.log('Attempting to list models via SDK...\n');
    
    // Method 1: Try direct API call
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log('✅ ✅ ✅ MODELS FOUND! ✅ ✅ ✅\n');
    console.log(`Total models: ${data.models?.length || 0}\n`);
    
    if (data.models && data.models.length > 0) {
      console.log('📋 Available models:\n');
      data.models.forEach((model, index) => {
        console.log(`${index + 1}. ${model.name}`);
        console.log(`   Display Name: ${model.displayName || 'N/A'}`);
        console.log(`   Supported: ${model.supportedGenerationMethods?.join(', ') || 'N/A'}`);
        console.log();
      });
      
      // Find the best model for chat
      const chatModels = data.models.filter(m => 
        m.supportedGenerationMethods?.includes('generateContent')
      );
      
      console.log('\n💡 Recommended models for your backend:\n');
      chatModels.slice(0, 5).forEach(m => {
        console.log(`✅ ${m.name}`);
      });
      
    } else {
      console.log('⚠️ No models found. Your API key might not have access to Gemini.');
    }
    
  } catch (error) {
    console.error('\n❌ ERROR listing models:');
    console.error('Message:', error.message);
    console.error('\n💡 Your API key might not have Gemini access.');
    console.error('Get a new key from: https://makersuite.google.com/app/apikey\n');
  }
}

listModels();

