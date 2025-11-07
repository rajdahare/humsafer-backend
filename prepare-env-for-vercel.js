// Helper script to prepare Firebase service account for Vercel
// This minifies the JSON to a single line for environment variable

const fs = require('fs');
const path = require('path');

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║  Prepare Environment Variables for Vercel Deployment     ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Check if service account file exists
const serviceAccountPath = path.join(__dirname, 'service-account-key.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Error: service-account-key.json not found!');
  console.log('\nPlease download your Firebase service account key:');
  console.log('1. Go to Firebase Console');
  console.log('2. Project Settings > Service Accounts');
  console.log('3. Click "Generate new private key"');
  console.log('4. Save as service-account-key.json in this directory\n');
  process.exit(1);
}

// Read and minify the service account JSON
try {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  const minified = JSON.stringify(serviceAccount);
  
  console.log('✅ Service account file found and minified!\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Add this to Vercel Environment Variables:');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('Variable Name: FIREBASE_SERVICE_ACCOUNT');
  console.log('Variable Value:\n');
  console.log(minified);
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('\n📋 Steps to add to Vercel:');
  console.log('1. Go to https://vercel.com/dashboard');
  console.log('2. Select your project');
  console.log('3. Settings → Environment Variables');
  console.log('4. Add new variable:');
  console.log('   - Name: FIREBASE_SERVICE_ACCOUNT');
  console.log('   - Value: Copy the JSON above (entire line)');
  console.log('   - Environment: Production');
  console.log('5. Click "Save"');
  console.log('\n✅ Done! Your Firebase credentials are ready for Vercel\n');
  
  // Save to a temporary file for easy copying
  const outputPath = path.join(__dirname, 'firebase-env-var.txt');
  fs.writeFileSync(outputPath, minified);
  console.log(`📁 Also saved to: ${outputPath}`);
  console.log('   (You can delete this file after adding to Vercel)\n');
  
} catch (error) {
  console.error('❌ Error processing service account file:', error.message);
  process.exit(1);
}

