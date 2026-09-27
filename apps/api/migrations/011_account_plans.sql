ALTER TABLE accounts
  ADD COLUMN plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'loki', 'pro')),
  ADD COLUMN plan_status text NOT NULL DEFAULT 'active' CHECK (plan_status IN ('active', 'past_due', 'canceled')),
  ADD COLUMN stripe_customer_id text UNIQUE,
  ADD COLUMN stripe_subscription_id text UNIQUE,
  ADD COLUMN plan_period_end timestamptz;
