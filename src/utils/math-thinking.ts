/**
 * Mathematical thinking messages displayed while the LLM is reasoning.
 * Organized by mathematical discipline, each with 2-3 entries.
 */
const THINKING_MESSAGES: readonly string[] = [
  // Algebra
  'Computing Ext groups...',
  'Resolving projective modules...',
  'Chasing diagrams in the derived category...',

  // Algebraic Geometry
  'Blowing up singular loci...',
  'Computing sheaf cohomology...',
  'Descending along a faithfully flat morphism...',

  // Algebraic Topology
  'Computing homotopy groups of spheres...',
  'Running the Adams spectral sequence...',
  'Lifting through a fibration...',

  // Analysis
  'Evaluating singular integrals...',
  'Estimating Sobolev norms...',
  'Applying the mountain pass theorem...',

  // Category Theory
  'Constructing a Kan extension...',
  'Verifying the triangle identities...',
  'Taking the colimit over a filtered diagram...',

  // Combinatorics
  'Counting lattice paths...',
  'Applying the Lindstrom-Gessel-Viennot lemma...',
  'Evaluating a symmetric function...',

  // Complex Geometry
  'Solving the dbar equation...',
  'Computing Hodge numbers...',
  'Deforming the complex structure...',

  // Differential Geometry
  'Parallel transporting along a geodesic...',
  'Computing the Riemann curvature tensor...',
  'Flowing along the Ricci flow...',

  // Differential Topology
  'Counting handle attachments...',
  'Computing the Morse index...',
  'Performing surgery on a cobordism...',

  // Dynamical Systems
  'Iterating the Poincare return map...',
  'Checking for strange attractors...',
  'Computing Lyapunov exponents...',

  // Geometric Topology
  'Triangulating the manifold...',
  'Computing the Jones polynomial...',
  'Performing Dehn surgery...',

  // Homological Algebra
  'Resolving a chain complex...',
  'Computing Tor groups...',
  'Chasing through the long exact sequence...',

  // Lie Theory
  'Decomposing into weight spaces...',
  'Computing the Killing form...',
  'Exponentiating to the group...',

  // Logic & Set Theory
  'Forcing over a ground model...',
  'Climbing the constructible hierarchy...',
  'Checking large cardinal axioms...',

  // Mathematical Physics
  'Renormalizing the path integral...',
  'Computing Feynman diagrams...',
  'Quantizing the symplectic manifold...',

  // Number Theory
  'Sieving for primes...',
  'Computing the class number...',
  'Lifting a Galois representation...',

  // Operator Algebras
  'Taking the GNS construction...',
  'Computing the K-theory of a C*-algebra...',
  'Classifying von Neumann factors...',

  // Partial Differential Equations
  'Bootstrapping regularity...',
  'Constructing barrier functions...',
  'Solving the Cauchy problem...',

  // Probability Theory
  'Sampling from the Gaussian free field...',
  'Computing exit times...',
  'Coupling the random walks...',

  // Representation Theory
  'Decomposing into irreducibles...',
  'Computing character tables...',
  'Inducing from a parabolic subgroup...',

  // Symplectic Geometry
  'Counting pseudoholomorphic curves...',
  'Computing Floer homology...',
  'Generating the Fukaya category...',

  // Topology (General / Homotopy Theory)
  'Assembling the Postnikov tower...',
  'Computing the mapping class group...',
  'Stabilizing in the Spanier-Whitehead category...',
]

let lastIndex = -1

/**
 * Returns a random math thinking message, avoiding immediate repeats.
 */
export function getRandomThinkingMessage(): string {
  let index: number
  do {
    index = Math.floor(Math.random() * THINKING_MESSAGES.length)
  } while (index === lastIndex && THINKING_MESSAGES.length > 1)
  lastIndex = index
  return THINKING_MESSAGES[index]
}
