# Money Coach SMS

AI financial assistant powered by Knot API + Claude + Photon SMS

## Setup

1. Install dependencies:

```bash
npm install


```

### Set up database:

```
# Create database
createdb moneycoach

# Run schema
npm run db:setup

# Seed test data
npm run db:seed
```

### Configure environment:

```
cp .env.example .env
# Fill in your credentials
```

### Run server:

```
npm run dev
```
