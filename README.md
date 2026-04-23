# Dead Yet

A mobile app that monitors your daily activity and checks in on you. If you don't respond to check-ins, it alerts your emergency contacts and reveals your death notes.

## How It Works

**1. Onboarding**
- User enters their name and creates a 4-digit PIN
- PIN protects death notes access

**2. Activity Tracking**
- Tracks screen time and app usage
- Manual "I'm Alive" check-in button
- All data stored locally on device

**3. The Check-in Flow**
```
Normal State → No activity for 3 days → "Are you alive?" notification
                                    ↓
                    User confirms alive → Reset timer
                                    ↓
         No confirmation in 24 hours → Emergency protocol triggered
                                    ↓
                    Calls emergency contacts in priority order
                                    ↓
           Contact confirms → Emergency cancelled
                                    ↓
      Contacts can't reach user → Death notes revealed to contacts
```

**4. Death Notes**
- Address (with entry codes)
- Financial accounts (bank, investment, crypto)
- Pets with feeding/vet instructions
- Other important info

**5. Emergency Contacts**
- Add multiple contacts with priority order (1 = first called)
- Phone calls via Twilio Voice API
- Sequential calling until someone confirms

## Tech Stack

- React Native with Expo
- TypeScript
- Local-only storage (AsyncStorage)
- Twilio Voice API for emergency calls (placeholder - needs backend)

## Project Structure

```
dead-yet/
├── App.tsx                      # Entry point with all providers
├── src/
│   ├── screens/                 # 6 screens
│   │   ├── OnboardingScreen.tsx
│   │   ├── HomeScreen.tsx       # Dashboard showing days silent
│   │   ├── ActivityScreen.tsx   # Screen time and app usage
│   │   ├── EmergencyContactsScreen.tsx
│   │   ├── DeathNoteScreen.tsx  # Address, financials, pets
│   │   └── SettingsScreen.tsx
│   ├── services/
│   │   ├── StorageService.ts    # AsyncStorage wrapper
│   │   ├── ActivityTrackingService.ts
│   │   ├── NotificationService.ts
│   │   ├── EmergencyService.ts  # Twilio call orchestration
│   │   └── DeathNoteService.ts
│   ├── contexts/               # React Context for state
│   ├── models/types.ts         # TypeScript interfaces
│   └── navigation/             # Stack navigator
└── package.json
```

## Getting Started

```bash
# Install dependencies
npm install

# Run on iOS Simulator
npm run ios

# Run on Android
npm run android

# Run with Expo
npm start
```

## iOS App Usage Tracking Note

Apple restricts app usage tracking on iOS. This app focuses on:
- Screen time tracking
- Manual check-ins as primary activity signals

## Twilio Integration

The emergency call functionality is **placeholder code**. To enable real phone calls:

1. Set up a Twilio account and Voice API
2. Create a backend service (Twilio Functions or your own server)
3. Update `src/services/EmergencyService.ts` to call your backend

## License

MIT