// BottomStatusBar molecule component
import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import styles from './BottomStatusBar.module.scss';

const WORKFLOW_STEPS = [
  { number: 1, label: 'Upload', key: 'upload' },
  { number: 2, label: 'Context', key: 'context' },
  { number: 3, label: 'Process', key: 'process' },
  { number: 4, label: 'Review', key: 'review' },
  { number: 5, label: 'Export', key: 'export' },
];

export const BottomStatusBar: React.FC = () => {
  const jobs = useAppStore((state) => state.jobs);
  const hasJobs = jobs.length > 0;
  
  // Определяем текущий шаг
  let currentStep = 1;
  if (hasJobs) {
    const hasProcessing = jobs.some((j) => j.status === 'processing' || j.status === 'queued');
    const hasDone = jobs.some((j) => j.status === 'done');
    
    if (hasProcessing) currentStep = 3;
    if (hasDone) currentStep = 4;
  }
  
  return (
    <div className={styles.statusBar}>
      {!hasJobs && (
        <div className={styles.empty}>
          <span className={styles.icon}>✨</span>
          <span>Загрузи фото чтобы начать</span>
        </div>
      )}
      
      {hasJobs && (
        <div className={styles.workflow}>
          {WORKFLOW_STEPS.map((step, idx) => (
            <React.Fragment key={step.key}>
              <div
                className={`${styles.step} ${
                  step.number <= currentStep ? styles.completed : ''
                } ${step.number === currentStep ? styles.active : ''}`}
              >
                <span className={styles.number}>{step.number}</span>
              </div>
              
              {idx < WORKFLOW_STEPS.length - 1 && (
                <div
                  className={`${styles.line} ${
                    step.number < currentStep ? styles.completed : ''
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};