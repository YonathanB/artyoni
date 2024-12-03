
// scripts/update-lib-deps.js
const fs = require('fs');
const path = require('path');

// Lire le fichier de dépendances généré par nx graph
const depsData = JSON.parse(fs.readFileSync('./deps.json', 'utf8'));

// Pour chaque projet dans le graphe
Object.keys(depsData.graph.nodes).forEach(projectName => {
    const projectNode = depsData.graph.nodes[projectName];
    
    // Si c'est une librairie
    if (projectNode.type === 'lib') {
        const packageJsonPath = path.join('libs', projectName, 'package.json');
        
        // Lire le package.json existant
        let packageJson = {};
        try {
            packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        } catch (error) {
            console.log(`Création nouveau package.json pour ${projectName}`);
        }
        
        // Garder les champs existants importants
        const existingFields = {
            name: packageJson.name,
            version: packageJson.version
        };
        
        // Réinitialiser les dépendances
        packageJson = {
            ...existingFields,
            dependencies: {},
            peerDependencies: {}
        };
        
        // Récupérer les dépendances du projet
        const deps = Object.keys(depsData.graph.dependencies[projectName] || {});
        
        deps.forEach(dep => {
            const depNode = depsData.graph.nodes[dep];
            if (depNode) {
                // Si c'est une dépendance interne (@a/*)
                if (dep.startsWith('@a/')) {
                    packageJson.dependencies[dep] = '*';
                } else {
                    packageJson.peerDependencies[dep] = '*';
                }
            }
        });
        
        // Sauvegarder le package.json mis à jour
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        console.log(`Mis à jour: ${packageJsonPath}`);
    }
});
