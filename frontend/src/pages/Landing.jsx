import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BedDouble, Fuel, HandCoins, ReceiptText, UsersRound, Utensils } from 'lucide-react';
import './Landing.css';

const sampleExpenses = [
  { title: 'Weekend stay', category: 'Accommodation', payer: 'Asha', amount: '3,600', Icon: BedDouble },
  { title: 'Fuel for the drive', category: 'Fuel', payer: 'You', amount: '1,800', Icon: Fuel },
  { title: 'Dinner together', category: 'Food & Drink', payer: 'Ravi', amount: '600', Icon: Utensils }
];

const steps = [
  {
    title: 'Bring your people together',
    description: 'Create a trip and share an invite link. Add friends as guests, too, so everyone’s expenses are included.',
    Icon: UsersRound
  },
  {
    title: 'Add it as you go',
    description: 'Record who paid and choose an equal, exact, or percentage split. Categories are suggested from the description.',
    Icon: ReceiptText
  },
  {
    title: 'See what’s owed',
    description: 'Check everyone’s balance and record repayments when you settle up. Keep the whole trip in one place.',
    Icon: HandCoins
  }
];

const Landing = () => {
  useEffect(() => {
    document.title = 'TripSplit — Shared expenses, sorted';
  }, []);

  return (
    <div className="landing-page">
      <a className="landing-skip-link" href="#landing-main">Skip to content</a>
      <header className="landing-header">
        <Link className="landing-brand" to="/" aria-label="TripSplit home">
          <img src="/icons/icon-192.svg" width="36" height="36" alt="" />
          <span>TripSplit</span>
        </Link>
        <nav className="landing-nav" aria-label="Main navigation">
          <a className="landing-how-link" href="#how-it-works">How it works</a>
          <Link to="/login">Log in</Link>
          <Link className="btn btn-primary" to="/register">Create account</Link>
        </nav>
      </header>

      <main id="landing-main" tabIndex={-1}>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-intro">
            <h1 id="landing-title">Enjoy the trip.<br /><span>Keep expenses together.</span></h1>
            <p className="landing-lead">
              From the first tank of fuel to the last dinner, keep track of what everyone paid,
              split the costs, and see who owes whom.
            </p>
            <div className="landing-actions">
              <Link className="btn btn-primary" to="/register">Create account</Link>
              <Link className="btn btn-secondary" to="/login">Log in</Link>
            </div>
          </div>

          <figure className="landing-preview" aria-labelledby="landing-preview-caption">
            <figcaption id="landing-preview-caption">Example trip</figcaption>
            <div className="landing-trip-header">
              <div>
                <h2>A weekend away</h2>
                <p>3 friends <span aria-hidden="true">·</span> INR</p>
              </div>
              <div className="landing-avatars" aria-label="You, Asha, and Ravi">
                <span>Y</span><span>A</span><span>R</span>
              </div>
            </div>
            <div className="landing-trip-total">
              <span>Total expenses</span>
              <strong>₹6,000<span>.00</span></strong>
            </div>
            <div className="landing-expense-list">
              {sampleExpenses.map(({ title, category, payer, amount, Icon: icon }) => {
                const Icon = icon;

                return (
                  <div className="landing-expense" key={title}>
                    <span className="landing-expense-icon"><Icon size={20} aria-hidden="true" /></span>
                    <div className="landing-expense-description">
                      <h3>{title}</h3>
                      <p>{category} <span aria-hidden="true">·</span> {payer} paid</p>
                    </div>
                    <span className="landing-expense-amount">₹{amount}</span>
                  </div>
                );
              })}
            </div>
            <div className="landing-balance">
              <span className="landing-balance-avatar" aria-hidden="true">A</span>
              <div><p>You owe Asha</p><span>With debts simplified</span></div>
              <strong>₹200</strong>
            </div>
          </figure>
        </section>

        <section className="landing-how" id="how-it-works" aria-labelledby="landing-how-title">
          <div className="landing-section-heading">
            <h2 id="landing-how-title">A shared trip.<br />A clear picture of the costs.</h2>
            <p>Everyone pays for different things.<br />TripSplit helps you keep track together.</p>
          </div>
          <div className="landing-steps">
            {steps.map(({ title, description, Icon: icon }) => {
              const Icon = icon;

              return (
                <article key={title}>
                  <Icon className="landing-step-icon" size={25} aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="landing-closing" aria-labelledby="landing-closing-title">
          <div>
            <h2 id="landing-closing-title">Ready for your next trip?</h2>
            <p>Get your group together and start keeping track.</p>
          </div>
          <div className="landing-closing-actions">
            <Link className="btn btn-primary" to="/register">Create account</Link>
            <p>Already using TripSplit? <Link to="/login">Log in</Link></p>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <Link className="landing-brand" to="/">TripSplit</Link>
        <span>Shared expenses, sorted.</span>
      </footer>
    </div>
  );
};

export default Landing;
