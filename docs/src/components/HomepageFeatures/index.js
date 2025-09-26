import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: 'Easy to Use',
    Svg: require('@site/static/img/undraw_docusaurus_mountain.svg').default,
    description: (
      <>
        XR Blocks was designed to get your website up and running quickly.
        Our SDK requires no compilation or bundlers. Just save and refresh as you go.
      </>
    ),
  },
  {
    title: 'Focus on What Matters',
    Svg: require('@site/static/img/undraw_docusaurus_tree.svg').default,
    description: (
      <>
        XR Blocks lets you focus on your app, and we&apos;ll do the chores.
        Our SDK automatically sets up the renderer and WebXR session.
      </>
    ),
  },
  {
    title: 'Powered by WebXR and three.js',
    Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
    description: (
      <>
        XR Blocks builds upon three.js to create WebXR experiences.
        Build new XR scenes using WebXR hands and depth capabilities.
      </>
    ),
  },
];

function Feature({Svg, title, description}) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
