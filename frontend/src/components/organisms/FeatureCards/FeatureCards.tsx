import React from 'react';
import styles from './FeatureCards.module.scss';

export const FeatureCards: React.FC = () => {
  return (
    <section className={styles.cards}>
      <h2>Features</h2>
      <p>See how AI metadata generation can streamline your workflow.</p>
    </section>
  );
};
