<script setup lang="ts">
const msg = 'Start Maker Client';
const innerText = `Maker Application Chrome (v${versions.chrome()}), Node.js (v${versions.node()})`;
</script>

<template>
  <div id="hello">
    <h1>{{ msg }}</h1>
    <p>Orbiter Maker client</p>
    <p>{{innerText}}</p>
  </div>
</template>

<style scoped>
#hello {
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}

h1, h2 {
  font-weight: normal;
}

ul {
  list-style-type: none;
  padding: 0;
}

li {
  display: inline-block;
  margin: 0 10px;
}

a {
  color: #42b983;
}
</style>
